import dotenv from 'dotenv';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { BufferMemory } from "langchain/memory";
import { ChatPromptTemplate, MessagesPlaceholder } from "langchain/prompts";
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
        const prompt = ChatPromptTemplate.fromPromptMessages([
            [
                'system',
                `Your name is Emily. You are an assistant who calls on behalf of a client. You do not reveal your client's information. All the responses should be small like you are taking on a call. do not put much information at once make it one by one. You May use "Mm-hmm", or "hmm" to respond.
                
                Now ${initialMsg}.
                
                Do not respond to human expressions like ahh, umm.`
            ],
            new MessagesPlaceholder("history"),
            ['human', '{input}']
        ])
        
        const memory = new BufferMemory({
            returnMessages: true,
            aiPrefix: 'Emily',
            memoryKey: 'history'
        })
        
        this.chain = new ConversationChain({
            llm: this.chat,
            prompt,
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
    protected tokens: string[] = []

    public handleLLMNewToken = (token: string) => {
        const brokenToken = token.split(' ')

        if(brokenToken.length === 1) {
            this.handleSingleToken(brokenToken[0])
            return;
        }

        this.handleDoubleToken(brokenToken)

        if(! this.tokens.length) {
            return;
        }

        this.emitToken()
    }

    public handleLLMEnd = () => {
        if(! this.tokens.length) {
            return
        }

        this.emit('token', `${this.tokens.join('')} `)
        this.resetTokens()
        this.emit('token', '')
    }

    protected handleSingleToken(token: string) {
        if(token === '') {
            return;
        }

        this.tokens.push(token)
    }

    protected handleDoubleToken(tokens: string[]) {
        const lastToken = this.tokens.pop()

        this.tokens.push(`${lastToken} `)

        this.handleSingleToken(tokens[1])
    }

    protected emitToken() {
        const spaceIndex = this.tokens.findIndex(val => val.endsWith(' '))

        if(spaceIndex === -1) {
            return;
        }

        const tokensToEmit = this.tokens.slice(0, spaceIndex + 1)

        this.tokens.splice(0, spaceIndex + 1)
        
        this.emit('token', tokensToEmit.join(''))
    }

    protected resetTokens() {
        this.tokens = []
    }
}

