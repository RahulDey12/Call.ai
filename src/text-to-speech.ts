import axios from 'axios';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { Duplex, PassThrough } from 'stream';
import wavefile from 'wavefile'
import { exec, execSync } from 'child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import WebSocket from 'ws';

// Loads env
dotenv.config()

export class TTS extends EventEmitter
{
    protected socket: WebSocket;

    protected isSocketOpen: boolean;

    protected tempTexts: string[] = []

    constructor(protected voice_id: string, protected model_id = 'eleven_monolingual_v1') {
        super()
    }

    protected get xi_url(): string 
    {
        return `wss://api.elevenlabs.io/v1/text-to-speech/${this.voice_id}/stream-input?optimize_streaming_latency=4&output_format=pcm_16000&model_id=${this.model_id}`
    }

    public push(text: string): void
    {
        if(this.isSocketOpen) {
            this.socket.send(JSON.stringify({text}))

            return;
        }

        if(! this.socket) {
            this.setupWebsocket()
        }

        this.tempTexts.push(text)
    }

    protected setupWebsocket()
    {
        this.socket = new WebSocket(this.xi_url)

        this.socket.on('open', _ => {
            const bosMessage = {
                text: " ",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: true
                },
                generation_config: {
                    chunk_length_schedule: [50]
                },
                xi_api_key: process.env.ELEVEN_LABS_KEY
            }

            this.socket.send(JSON.stringify(bosMessage))

            if(this.tempTexts.length) {
                this.tempTexts.forEach(text => {
                    this.socket.send(JSON.stringify({text}))
                })
            }

            this.tempTexts = []

            this.isSocketOpen = true
        })

        this.socket.on('message', audio => {
            const rawAudio = JSON.parse(audio.toString()).audio

            if(! rawAudio) {
                return;
            }

            const payload = this.encode(rawAudio)
            this.emit('audio', payload)
        })

        this.socket.on('close', _ => {
            delete this.socket
            this.isSocketOpen = false
        })
    }

    protected async tts(text: string) {
        const { data: audio } = await axios({
            method: 'POST',
            url: this.xi_url,
            data: {
                text: text,
                model_id: this.model_id,
                voice_settings: {
                    similarity_boost: 0.5,
                    stability: 0
                }
            },
            headers: {
                Accept: "audio/mpeg",
                "xi-api-key": process.env.ELEVEN_LABS_KEY,
                "Content-Type": "application/json",
            },

            responseType: 'arraybuffer',
        })

        const payload = this.encode(audio)
        this.emit('audio', payload)
    }

    protected encode(audio: string): string 
    {
        const tmpPcmFile = `/tmp/${Math.random().toString(36).substring(2)}`;
        writeFileSync(tmpPcmFile, Buffer.from(audio, 'base64'))

        const tmpMuLawFile = `/tmp/${Math.random().toString(36).substring(2)}.ul`;
        execSync(`ffmpeg -f s16le -ar 16000 -ac 1 -i ${tmpPcmFile} -f mulaw -ar 8000 -ac 1 ${tmpMuLawFile}`);

        const muLawBuffer = readFileSync(tmpMuLawFile);
        const base64Content = muLawBuffer.toString('base64');

        unlinkSync(tmpPcmFile);
        unlinkSync(tmpMuLawFile);

        return base64Content;
    }
}

