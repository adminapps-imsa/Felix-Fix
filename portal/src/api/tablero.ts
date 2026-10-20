import { api } from './client';
import type { PeriodoTablero, Tablero } from '../types/tablero';

export const obtenerTablero = (dias: PeriodoTablero) => api.get<Tablero>(`/tablero?dias=${dias}`);
