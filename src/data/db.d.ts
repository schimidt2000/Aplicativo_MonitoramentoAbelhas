/**
 * O TypeScript não resolve extensões de plataforma; o Metro sim. Esta
 * declaração descreve o contrato que db.native.ts e db.web.ts implementam.
 * Ver research.md D-001.
 */
import type { SqlDb } from './types';

export declare function abrirBanco(): Promise<SqlDb>;
