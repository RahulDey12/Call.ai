import {
    TranscribeStreamingClient,
    StartStreamTranscriptionCommand,
    AudioStream,
} from "@aws-sdk/client-transcribe-streaming";

import { EventEmitter } from 'events'
import { PassThrough, Duplex, Readable } from 'stream'

import dotenv from 'dotenv';
dotenv.config()

export class Transcription extends EventEmitter
{
    private stream?: Duplex;
    private client: TranscribeStreamingClient;

    constructor() 
    {
        super()

        this.client = new TranscribeStreamingClient({ 
            region: process.env.AWS_DEFAULT_REGION,
            apiVersion: 'latest',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            }
        });
    }

    public getStream(): Duplex
    {
        if(this.stream) {
            return this.stream;
        }

        this.stream = new PassThrough();
        return this.stream;
    }

    public push(chunk: Buffer): void
    {
        this.getStream().write(chunk)      
    }

    public subscribe(): void
    {
        const command = new StartStreamTranscriptionCommand({
            LanguageCode: 'en-US',
            MediaSampleRateHertz: 8000,
            MediaEncoding: 'pcm',
            AudioStream: this.audioStream()
        })

        this.client.send(command).then(response => {
            const transcriptsStream = Readable.from(response.TranscriptResultStream);

            transcriptsStream.on('data', chunk => this.emit('transcription', chunk))
        })
    }

    public unSubscribe(): void
    {
        this.getStream().destroy()
        this.client.destroy()
    }

    protected async *audioStream(): AsyncIterable<AudioStream> 
    {
        for await (const chunk of this.getStream()) {
            yield { AudioEvent: { AudioChunk: chunk } };
        }
    }
}
