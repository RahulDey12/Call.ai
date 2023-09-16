import { createServer } from 'http'
import { WebSocketServer } from 'ws';
import express from 'express';
import dotenv from 'dotenv';
import twilio from 'twilio'
import wavefile from 'wavefile'
import { createClient } from '@supabase/supabase-js'

import { Transcription } from './transcription.js';
import { Assistant } from './assistant.js';
import { TTS } from './text-to-speech.js';

// Loads env
dotenv.config()

const app = express()

app.all('/twiml', (_req, res) => {
    const { VoiceResponse }  = twilio.twiml

    const response = new VoiceResponse()
        response.connect().stream({
        url: `wss://${process.env.APP_URL}/`
    })

    res.setHeader('Content-Type', 'application/xml')

    res.send(response.toString())
})

const server = createServer(app);

const wss = new WebSocketServer({ server })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)

wss.on('connection', async (ws) => {
    let streamSid = ''

    const transcription = new Transcription()
    const assistant = new Assistant()
    const tts = new TTS('XrExE9yKIg1WjnnlVkGX')
    transcription.subscribe()
    tts.subscribe()
    
    transcription.on('transcription', (event) => {
        if(event.TranscriptEvent) {
            const results = event.TranscriptEvent.Transcript.Results;

            if(! results.length) {
                return
            }

            if(results[0]['IsPartial']) {
                return
            }

            assistant.push(results[0]['Alternatives'][0]['Transcript']);
        }
    })

    assistant.on('token', token => {
        tts.push(token)
    })

    tts.on('audio', audio => {
        ws.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: {
                payload: audio
            }
        }))
    })

    ws.on('message', async (message) => {
        const data = JSON.parse(message.toString());

        if(data.event === 'start') {
            const { data: call } = await supabase.from('calls')
                .select('*')
                .eq('call_sid', data.start.callSid)
                .limit(1)
                .single()

            if(! call) {
                ws.close()
            }

            streamSid = data.start.streamSid

            assistant.startConversation(call.description)
            assistant.subscribe()
        }

        if (data.event !== "media") {
            return;
        }

        const audioBuffer = Buffer.from(data.media.payload, 'base64');
        const wav = new wavefile.WaveFile()
        wav.fromScratch(1, 8000, '8m', audioBuffer)
        wav.fromMuLaw()
        const audioData = wav.data as any

        transcription.push(Buffer.from(audioData.samples))
    });

    ws.on('close', () => {
        transcription.unSubscribe()
    })
});

server.listen(3000, () => {
    console.log('Server started on http://localhost:3000')
})
