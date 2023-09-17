import axios from 'axios';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { Duplex, PassThrough } from 'stream';
import wavefile from 'wavefile'
import { exec, execSync } from 'child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';

// Loads env
dotenv.config()

export class TTS extends EventEmitter
{
    protected stream: Duplex;

    constructor(protected voice_id: string, protected model_id = 'eleven_monolingual_v1') {
        super()
    }

    protected get xi_url(): string 
    {
        return `https://api.elevenlabs.io/v1/text-to-speech/${this.voice_id}/stream?optimize_streaming_latency=4&output_format=pcm_16000`
    }

    protected getStream(): Duplex
    {
        if(this.stream) {
            return this.stream;
        }

        this.stream = new PassThrough();
        return this.stream;
    }

    public push(chunk: string): void
    {
        this.getStream().write(chunk)      
    }

    public subscribe(): void
    {
        (async () => {
            for await (const chunk of this.getStream()) {
                await this.tts(chunk.toString())
            }
        }).bind(this)()
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

    protected encode(audio: ArrayBuffer): string 
    {
        const tmpPcmFile = `/tmp/${Math.random().toString(36).substring(2)}`;
        writeFileSync(tmpPcmFile, Buffer.from(audio))

        const tmpMuLawFile = `/tmp/${Math.random().toString(36).substring(2)}.ul`;
        execSync(`ffmpeg -f s16le -ar 16000 -ac 1 -i ${tmpPcmFile} -f mulaw -ar 8000 -ac 1 ${tmpMuLawFile}`);

        const muLawBuffer = readFileSync(tmpMuLawFile);
        const base64Content = muLawBuffer.toString('base64');

        unlinkSync(tmpPcmFile);
        unlinkSync(tmpMuLawFile);
        
        // const wav = new wavefile.WaveFile()
        // wav.fromScratch(1, 16000, '16', buffer)
        // wav.toSampleRate(8000)
        // // wav.toBitDepth('8m')
        // wav.toMuLaw()
        
        // const audioData = wav.data as any;

        // return Buffer.from(audioData.samples).toString('base64');
        return base64Content;
    }
}

