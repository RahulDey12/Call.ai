import dotenv from 'dotenv';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { SystemMessage } from 'langchain/schema';
import { BufferMemory, ChatMessageHistory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import { EventEmitter } from 'events'
import { Duplex, PassThrough } from 'stream';

// Loads env
dotenv.config()

export class Assistant extends EventEmitter
{
    protected chat: ChatOpenAI;

    protected chain: ConversationChain;

    protected tokenHandler = new LlmTokenHandler();

    protected stream: Duplex;

    constructor() {
        super()
        
        this.chat = new ChatOpenAI({
            maxTokens: 6000,
            modelName: 'gpt-4',
            temperature: 0.9,
            streaming: true,
            callbacks: [this.tokenHandler]
        })
    }

    public getStream(): Duplex
    {
        if(this.stream) {
            return this.stream;
        }

        this.stream = new PassThrough();
        return this.stream;
    }

    public push(chunk: string): void
    {
        this.getStream().write(chunk + "\n")      
    }

    public subscribe() {
        this.tokenHandler.on('token', token => this.emit('token', token));

        (async () => {
            for await (const chunk of this.call()) {
                await this.chain.call({
                    input: chunk
                })
            }
        }).bind(this)()
    }

    public startConversation(initialMsg: string) {
        const pastMessages = [
            new SystemMessage(initialMsg),
        ];
        
        const memory = new BufferMemory({
            chatHistory: new ChatMessageHistory(pastMessages)
        })
        
        this.chain = new ConversationChain({
            llm: this.chat,
            memory
        })
    }

    protected async *call() {
        for await (const chunk of this.getStream()) {
            yield chunk.toString().trim()
        }
    }
}

class LlmTokenHandler extends EventEmitter
{
    public handleLLMNewToken = (token: string) => {
        this.emit('token', token)
    }
}

