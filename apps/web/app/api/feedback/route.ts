// Disabled for ÍRIS — no feedback system (academic project for I2A2 InsurMinds RAG course)
// Celso (I2A2): o I2A2 ainda vai ensinar a gente a fazer isso direito 😄
import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({ message: 'Feedback not available in this version' }, { status: 200 });
}
