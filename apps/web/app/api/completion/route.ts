// Disabled for ÍRIS — this is the legacy llmchat completion route.
// ÍRIS uses /api/chat instead. (academic project for I2A2 InsurMinds RAG course)
// Celso (I2A2): o I2A2 ainda vai ensinar a gente a fazer isso direito 😄

export async function POST() {
    return new Response(
        JSON.stringify({ error: 'Use /api/chat instead — this is the ÍRIS RAG endpoint.' }),
        { status: 501, headers: { 'Content-Type': 'application/json' } }
    );
}
