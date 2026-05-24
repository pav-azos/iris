export type Authority = 'law' | 'official' | 'third-party';

export interface ChunkMetadata {
  source: string;       // filename e.g. "L15040 - Nova lei de seguros.pdf"
  page: number;         // 0 for TXT files
  authority: Authority;
  section?: string;     // best-effort from PDF outline
}

export interface RawChunk {
  id: string;           // crypto.randomUUID()
  text: string;
  metadata: ChunkMetadata;
}

export interface Chunk extends RawChunk {
  embedding: number[];  // 1024d from bge-m3
}

export interface CorpusHeader {
  embedModel: string;   // "bge-m3"
  dim: number;          // 1024
  version: number;      // 1
  indexedAt: string;    // ISO 8601
}

export interface Corpus {
  header: CorpusHeader;
  chunks: Chunk[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;        // biased cosine score
}

export interface EmbedConfig {
  baseUrl: string;
  model: string;
}
