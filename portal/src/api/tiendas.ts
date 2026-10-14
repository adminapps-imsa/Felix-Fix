import { api } from './client';
import type { Tienda } from '../types/productoDanado';

export function listarTiendas() {
  return api.get<Tienda[]>('/tiendas');
}
