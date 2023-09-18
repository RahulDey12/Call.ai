import twilio from "twilio";
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER as string;
const xmlUrl = `https://${process.env.APP_URL}/twiml`

const client = new twilio.Twilio(accountSid, authToken);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
    auth: {
        persistSession: false,
    }
})

const call = await client.calls.create({
    url: xmlUrl,
    record: true,
    to: '+919804281062',
    from: twilioNumber,
})

const description = 'you are calling to Book an hircut appointment for 19th September 10 AM - 12 PM.'

await supabase.from('calls').insert({
    call_sid: call.sid,
    description,
})
