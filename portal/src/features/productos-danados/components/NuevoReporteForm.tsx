import React, { useEffect, useId, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { useAvisos } from '../../../components/ui/Avisos';
import { Combobox } from '../../../components/ui/Combobox';
import { SelectorOpciones } from '../../../components/ui/SelectorOpciones';
import { SeccionForm, ZonaArchivo } from '../../../components/ui/Formulario';
import type { ReporteDetalle, Tienda } from '../../../types/productoDanado';
import { useCatalogos, invalidarCatalogos } from '../hooks/useCatalogos';
import { crearReporte, corregirReporte } from '../../../api/productosDanados';
import { ApiError } from '../../../api/client';
import { useLimites } from '../../../auth/useLimites';
import { comprimirImagen } from '../../../lib/comprimirImagen';
import { normalizarTexto } from '../../../lib/texto';

const EVIDENCIA_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Alta de un reporte o, con `reporte`, la corrección de uno devuelto a la
 * tienda: el mismo formulario con sus datos cargados; al guardar vuelve a la
 * compradora. La foto actual se conserva si no se elige otra.
 */
export function NuevoReporteForm({
  tiendas,
  reporte,
  onClose,
  onCreated,
}: {
  tiendas: Tienda[];
  reporte?: ReporteDetalle;
  onClose: () => void;
  /** Recibe el reporte guardado. */
  onCreated: (r: ReporteDetalle) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [division, setDivision] = useState(reporte?.Division || '');
  const [motivo, setMotivo] = useState(reporte?.Motivo || '');
  const cat = useCatalogos();
  const EVIDENCIA_MAX_MB = useLimites().evidenciaMb;
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const esNuevo = (v: string, lista: string[]) => !lista.some((x) => normalizarTexto(x) === normalizarTexto(v));
  const idDivision = useId();
  const avisos = useAvisos();
  // Al corregir: el último comentario con el que la compradora lo devolvió.
  const comentario = reporte ? [...reporte.historial].reverse().find((h) => h.Accion === 'DevueltoTienda') : undefined;

  // Libera la object URL de la vista previa al cambiar de foto o al cerrar el formulario.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const procesarFoto = async (original: File | null) => {
    if (original && !EVIDENCIA_TIPOS.includes(original.type)) {
      setError('La foto de evidencia debe ser una imagen JPG, PNG o WEBP.');
      return;
    }
    // Se reduce antes de validar: una foto de celular grande queda liviana y cabe en el correo.
    setProcesandoFoto(true);
    const file = original ? await comprimirImagen(original) : null;
    setProcesandoFoto(false);
    if (file && file.size > EVIDENCIA_MAX_MB * 1024 * 1024) {
      setError(`La foto de evidencia pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${EVIDENCIA_MAX_MB} MB.`);
      return;
    }
    setError(null);
    setFoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (foto && (!EVIDENCIA_TIPOS.includes(foto.type) || foto.size > EVIDENCIA_MAX_MB * 1024 * 1024)) {
      setError(`La foto de evidencia debe ser JPG, PNG o WEBP de máximo ${EVIDENCIA_MAX_MB} MB.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData(e.currentTarget);
      form.set('division', division.trim());
      form.set('motivo', motivo.trim());
      if (foto) form.set('evidencia', foto);
      const guardado = reporte ? await corregirReporte(reporte.ReporteId, form) : await crearReporte(form);
      // Un motivo nuevo ya quedó en el catálogo: que aparezca en el próximo formulario y en los filtros.
      if (esNuevo(motivo, cat.motivos)) invalidarCatalogos();
      onCreated(guardado);
      onClose();
      avisos.ok(reporte ? `Reporte #${guardado.ReporteId} corregido: volvió a la compradora.` : `Reporte #${guardado.ReporteId} creado.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : reporte ? 'No se pudo guardar la corrección.' : 'No se pudo crear el reporte.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={reporte ? `Corregir reporte #${reporte.ReporteId}` : 'Reportar producto dañado'}
      onClose={onClose}
      wide
      dismissible={false}
      // Al corregir se abre encima del detalle del reporte.
      layer={reporte ? 'z-[60]' : undefined}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {comentario && (
          <div className="rounded-xl border border-brand-500/30 bg-brand-500/[0.06] px-3 py-2 text-sm">
            <div className="font-semibold">Qué pidió corregir la compradora</div>
            <p className="mt-1 whitespace-pre-wrap opacity-90">{comentario.Detalle}</p>
            <p className="mt-1 text-xs opacity-60">{comentario.UsuarioNombre || comentario.UsuarioId}</p>
          </div>
        )}

        <SeccionForm titulo="Dónde se encontró" ayuda="La tienda y la persona que lo reporta.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tienda o sucursal">
              <Select name="tiendaId" required defaultValue={reporte?.TiendaId ?? ''}>
                <option value="" disabled>
                  Selecciona una tienda
                </option>
                {tiendas.map((t) => (
                  <option key={t.TiendaId} value={t.TiendaId}>
                    {t.Nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Empleado que reporta">
              <Input name="empleadoReportaNombre" required minLength={2} maxLength={150} placeholder="Nombre completo" autoComplete="name" defaultValue={reporte?.EmpleadoReportaNombre} />
            </Field>
          </div>
        </SeccionForm>

        <SeccionForm titulo="Producto" ayuda="Tal como aparece en la etiqueta.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Field label="Código de barras">
              <Input name="codigoBarras" required maxLength={50} inputMode="numeric" className="font-mono" defaultValue={reporte?.CodigoBarras ?? undefined} />
            </Field>
            <Field label="Nombre del producto">
              <Input name="nombreProducto" required maxLength={200} defaultValue={reporte?.NombreProducto} />
            </Field>
            <Field label="Marca" opcional>
              <Input name="marca" maxLength={100} defaultValue={reporte?.Marca ?? undefined} />
            </Field>
            <Field label="División" grupo idEtiqueta={idDivision}>
              <SelectorOpciones
                required
                value={division}
                onChange={setDivision}
                opciones={cat.divisiones}
                etiquetaId={idDivision}
                error={cat.error ? 'No se pudieron cargar las divisiones.' : null}
                onReintentar={cat.reintentar}
              />
            </Field>
          </div>
        </SeccionForm>

        <SeccionForm titulo="El daño" ayuda="Qué le pasó, cuántas unidades y la foto que lo muestra.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Field label="Motivo">
              <Combobox
                required
                value={motivo}
                onChange={setMotivo}
                opciones={cat.motivos}
                nuevoLabel="Agregar motivo"
                placeholder="Elige o escribe uno nuevo"
                maxLength={100}
              />
            </Field>
            <Field label="Cantidad">
              <Input name="cantidad" type="number" min={0.001} max={100000} step="0.001" required inputMode="decimal" defaultValue={reporte ? Number(reporte.Cantidad) : undefined} />
            </Field>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-medium opacity-85">Foto de evidencia</span>
              <span className="text-xs opacity-50">(opcional)</span>
            </span>
            {preview && foto ? (
              <div className="anim-aparecer flex items-center gap-4 rounded-2xl border border-brand-500/30 bg-brand-500/[0.04] p-3">
                <img src={preview} alt="Vista previa de la evidencia" className="size-24 shrink-0 rounded-xl object-cover shadow-sm sm:size-28" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{foto.name}</p>
                  <p className="text-xs opacity-60">{(foto.size / 1024 / 1024).toFixed(1)} MB · lista para enviar</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-brand-600 ring-1 ring-brand-500/30 hover:bg-brand-500/10 dark:text-brand-300">
                      Cambiar foto
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; void procesarFoto(f); }} />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFoto(null);
                        setPreview(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    >
                      <X size={13} /> Quitar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <ZonaArchivo
                icono={ImagePlus}
                titulo={procesandoFoto ? 'Preparando la foto…' : reporte?.EvidenciaKey ? 'Toca para cambiar la foto' : 'Toca para tomar o elegir la foto'}
                ayuda={
                  reporte?.EvidenciaKey
                    ? `Se conserva la foto actual si no eliges otra. JPG, PNG o WEBP, máximo ${EVIDENCIA_MAX_MB} MB.`
                    : `Una buena foto ayuda a que el proveedor apruebe. JPG, PNG o WEBP, máximo ${EVIDENCIA_MAX_MB} MB.`
                }
                accept="image/jpeg,image/png,image/webp"
                disabled={procesandoFoto}
                onArchivos={(fs) => void procesarFoto(fs[0] || null)}
              />
            )}
          </div>

          <Field label="Descripción" opcional>
            <Textarea
              name="descripcion"
              rows={3}
              maxLength={1000}
              placeholder="Por ejemplo: el envase llegó roto y el producto se derramó."
              defaultValue={reporte?.Descripcion ?? undefined}
            />
          </Field>
        </SeccionForm>

        {reporte && (
          <SeccionForm titulo="Respuesta" ayuda="Lo lee la compradora junto con lo que corregiste.">
            <Field label="Mensaje para la compradora" opcional>
              <Textarea name="respuesta" rows={2} maxLength={1000} placeholder="Por ejemplo: corregí la cantidad y cambié la foto." />
            </Field>
          </SeccionForm>
        )}

        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t border-black/[0.07] bg-[var(--glass-bg)] px-6 py-4 dark:border-white/[0.08]">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={procesandoFoto} estado={saving ? 'cargando' : null}>
            {saving ? 'Guardando…' : reporte ? 'Guardar y reenviar' : 'Crear reporte'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
