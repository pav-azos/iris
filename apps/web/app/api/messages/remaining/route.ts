// Disabled for ÍRIS — no credits system (academic project for I2A2 InsurMinds RAG course)
// Celso (I2A2): o I2A2 ainda vai ensinar a gente a fazer isso direito 😄
import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json(
        { remaining: 999, maxLimit: 999, isAuthenticated: false, isFetched: true },
        { status: 200 }
    );
}
