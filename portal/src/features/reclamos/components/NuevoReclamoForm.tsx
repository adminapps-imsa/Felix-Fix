import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, FileSpreadsheet, FileText, LoaderCircle, Paperclip, Plus, ScanLine, Store, Trash2, Upload, Warehouse } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { SeccionForm, ZonaArchivo } from '../../../components/ui/Formulario';
import { Field, Input, Select, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Combobox } from '../../../components/ui/Combobox';
import { ApiError } from '../../../api/client';
import { P } from '../../../auth/permisos';
import { useAuth } from '../../../auth/useAuth';
import * as apiReclamos from '../../../api/reclamos';
import { cn } from '../../../lib/cn';
import type { Tienda } from '../../../types/productoDanado';
import type { CatalogosReclamo, DocumentoSapUsado, OrigenReclamo, PreviewExcel, Reclamo, RelacionProveedor, TipoReclamo } from '../../../types/reclamo';
import { TIPOS, TIPO_LABEL, TIPO_LABEL_CORTO, TIPOS_SOLO_NOTIFICACION, categoriaTipo } from '../lib/tipos';
import { TipoBadge } from './Badges';
import { ExcelPreviewModal, PdfPreviewModal } from './VisoresLazy';

interface Campos {
  origen: OrigenReclamo | '';
  sucursal: string;
  fechaRegistro: string;
  numeroEmbarqueFactura: string;
  mundo: string;
  departamento: string;
  marca: string;
  proveedor: string;
  compradora: string;
  division: string;
  comentario: string;
}

const CAMPOS_VACIOS: Campos = {
  origen: '',
  sucursal: '',
  fechaRegistro: '',
  numeroEmbarqueFactura: '',
  mundo: '',
  departamento: '',
  marca: '',
  proveedor: '',
  compradora: '',
  division: '',
  comentario: '',
};

const CATALOGOS_VACIOS: CatalogosReclamo = {
  proveedores: [],
  mundos: [],
  departamentos: [],
  marcas: [],
  compradoras: [],
  divisiones: [],
  motivos: [],
  disponible: false,
};

// Caché de la sesión: el catálogo pesa ~30 KB y cambia poco, no hace falta
// pedirlo cada vez que se abre el formulario.
const CATALOGOS_TTL_MS = 5 * 60 * 1000;
let catalogosCache: { datos: CatalogosReclamo; at: number } | null = null;
const relacionesCache = new Map<string, RelacionProveedor | null>();

async function cargarCatalogos(): Promise<CatalogosReclamo> {
  if (catalogosCache && Date.now() - catalogosCache.at < CATALOGOS_TTL_MS) return catalogosCache.datos;
  const datos = await apiReclamos.listarCatalogos();
  catalogosCache = { datos, at: Date.now() };
  return datos;
}

/** Tras crear un reclamo con una división nueva, que aparezca la próxima vez. */
function invalidarCatalogos() {
  catalogosCache = null;
}

const unico = (arr: string[] | undefined) => (arr?.length === 1 ? arr[0] : '');

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Marca de campo llenado solo (desde el Excel o el catálogo del proveedor). */
function TagAuto() {
  return (
    <span
      title="Llenado automáticamente: revísalo"
      className="rounded-full bg-brand-500/10 px-1.5 py-px text-[11px] font-semibold text-brand-600 dark:text-brand-400"
    >
      auto
    </span>
  );
}

type CampoAuto = keyof Campos | 'sapDocs';

/** "0004904487300" y "4904487300" son el mismo documento (mismo criterio que la API). */
const normalizarDocSap = (v: string) => {
  const texto = v.trim();
  return texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || texto.toUpperCase();
};

/** PDF de un documento SAP y el número que se leyó de él. */
interface PdfSap {
  id: number;
  file: File;
  leyendo: boolean;
  numero: string | null;
  error: string | null;
}
let pdfSeq = 0;

const esPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
const esExcel = (f: File) => /\.(xlsx|xls)$/i.test(f.name);

export function NuevoReclamoForm({
  tiendas,
  onClose,
  onCreated,
}: {
  tiendas: Tienda[];
  onClose: () => void;
  onCreated: (reclamo: Reclamo, adjuntosFallidos: string[]) => void;
}) {
  const [excel, setExcel] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewExcel | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const parseSeq = useRef(0);

  // Gof no hace reclamos de CEDI: solo ve Tienda, ya elegida.
  const soloTienda = useAuth().puede(P.recSoloTienda);
  const origenes: OrigenReclamo[] = soloTienda ? ['tienda'] : ['tienda', 'cedi'];
  const [campos, setCampos] = useState<Campos>(() => (soloTienda ? { ...CAMPOS_VACIOS, origen: 'tienda', fechaRegistro: hoyIso() } : CAMPOS_VACIOS));
  const [tipo, setTipo] = useState<TipoReclamo | ''>('');
  const [modoManual, setModoManual] = useState(false);
  const [sapDocs, setSapDocs] = useState<string[]>(['', '', '']);
  // Documentos que ya están en otro reclamo (clave normalizada → reclamos). Un documento SAP pertenece a un solo reclamo.
  const [docsUsados, setDocsUsados] = useState<Map<string, DocumentoSapUsado['reclamos']>>(new Map());
  const [revisandoDocs, setRevisandoDocs] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [pdfsSap, setPdfsSap] = useState<PdfSap[]>([]);
  const [verAdjunto, setVerAdjunto] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Campos que se llenaron solos; la marca se quita en cuanto el usuario los toca.
  const [autos, setAutos] = useState<Set<CampoAuto>>(new Set());
  const quitarAuto = (k: CampoAuto) =>
    setAutos((a) => {
      if (!a.has(k)) return a;
      const n = new Set(a);
      n.delete(k);
      return n;
    });
  const tag = (k: CampoAuto) => (autos.has(k) ? <TagAuto /> : undefined);

  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    setCampos((c) => ({ ...c, [k]: v }));
    quitarAuto(k);
  };

  const [catalogos, setCatalogos] = useState<CatalogosReclamo | null>(null);
  useEffect(() => {
    let vivo = true;
    cargarCatalogos()
      .then((c) => vivo && setCatalogos(c))
      .catch(() => vivo && setCatalogos(CATALOGOS_VACIOS)); // sin catálogo: todo queda como texto libre
    return () => {
      vivo = false;
    };
  }, []);
  const cat = catalogos ?? CATALOGOS_VACIOS;

  // Proveedor del catálogo -> sus mundos/departamentos/marcas/compradoras van
  // primero en cada lista, y los campos vacíos se llenan si hay un solo valor.
  const [relacion, setRelacion] = useState<RelacionProveedor | null>(null);
  const proveedorEnCatalogo = useMemo(() => {
    const buscado = campos.proveedor.trim().toUpperCase();
    return buscado ? cat.proveedores.find((p) => p.toUpperCase() === buscado) ?? null : null;
  }, [campos.proveedor, cat.proveedores]);
  useEffect(() => {
    if (!proveedorEnCatalogo) return setRelacion(null);
    let vivo = true;
    const aplicar = (r: RelacionProveedor | null) => {
      if (!vivo) return;
      setRelacion(r);
      if (!r) return;
      setCampos((c) => {
        const n = {
          ...c,
          mundo: c.mundo || unico(r.mundos),
          departamento: c.departamento || unico(r.departamentos),
          marca: c.marca || unico(r.marcas),
          compradora: c.compradora || unico(r.compradoras),
        };
        const nuevos = (['mundo', 'departamento', 'marca', 'compradora'] as const).filter((k) => !c[k] && n[k]);
        if (nuevos.length) setAutos((a) => new Set([...a, ...nuevos]));
        return n;
      });
    };
    const key = proveedorEnCatalogo.toUpperCase();
    if (relacionesCache.has(key)) aplicar(relacionesCache.get(key) ?? null);
    else
      apiReclamos
        .relacionProveedor(proveedorEnCatalogo)
        .then((r) => {
          relacionesCache.set(key, r);
          aplicar(r);
        })
        .catch(() => aplicar(null));
    return () => {
      vivo = false;
    };
  }, [proveedorEnCatalogo]);

  const esCedi = campos.origen === 'cedi';

  const elegirOrigen = (o: OrigenReclamo) => {
    set('origen', o);
    if (!campos.fechaRegistro) setCampos((c) => ({ ...c, fechaRegistro: c.fechaRegistro || hoyIso() }));
  };

  // ---------------- Excel principal ----------------

  const procesarExcel = async (file: File | null) => {
    // Todo lo que vino del archivo anterior se descarta ANTES de leer el nuevo.
    // Lo que eligió el usuario (no viene del Excel) se conserva.
    setCampos((c) => ({ ...CAMPOS_VACIOS, origen: c.origen, compradora: c.compradora, division: c.division, comentario: c.comentario }));
    setTipo('');
    setModoManual(false);
    setPreview(null);
    setParseError(null);
    setAutos(new Set());
    setExcel(file);
    if (!file) return;

    const seq = ++parseSeq.current;
    setParsing(true);
    try {
      const p = await apiReclamos.previsualizarExcel(file);
      if (seq !== parseSeq.current) return; // el usuario ya eligió otro archivo
      setPreview(p);
      const delExcel = {
        origen: soloTienda ? 'tienda' : p.origen,
        sucursal: p.sucursal || '',
        fechaRegistro: p.fechaRegistro || '',
        numeroEmbarqueFactura: p.numeroEmbarqueFactura || '',
        mundo: p.mundo || '',
        departamento: p.departamento || '',
        marca: p.marca || '',
        proveedor: p.proveedor || '',
      };
      const marcados = new Set<CampoAuto>((Object.keys(delExcel) as (keyof typeof delExcel)[]).filter((k) => delExcel[k]));
      if (p.division) marcados.add('division');
      setCampos((c) => {
        // Compradora y comentario solo se sugieren si el usuario no puso nada.
        if (!c.compradora && p.compradora) marcados.add('compradora');
        if (!c.comentario && p.comentario) marcados.add('comentario');
        return {
          ...c,
          ...delExcel,
          // La división del encabezado CEDI manda; sin ella se conserva la elegida.
          division: p.division || c.division,
          // Sin fecha en el Excel (la plantilla CEDI suele venir sin ella): hoy.
          fechaRegistro: delExcel.fechaRegistro || hoyIso(),
          compradora: c.compradora || p.compradora || '',
          comentario: c.comentario || p.comentario || '',
        };
      });
      if (p.documentosSap.length) {
        setSapDocs([...p.documentosSap, '', '', ''].slice(0, Math.max(3, p.documentosSap.length)));
        marcados.add('sapDocs');
      }
      setAutos(marcados);
      setTipo(p.tipoSugerido || '');
    } catch (err) {
      if (seq !== parseSeq.current) return;
      // El archivo sigue adjunto: el usuario puede completar todo a mano.
      setParseError(err instanceof ApiError ? err.message : 'No se pudo leer el Excel.');
      setModoManual(true);
      setCampos((c) => ({ ...c, fechaRegistro: c.fechaRegistro || hoyIso() }));
    } finally {
      if (seq === parseSeq.current) setParsing(false);
    }
  };

  // ---------------- Tipo ----------------

  const desglose = useMemo(
    () => (Object.entries(preview?.desglose || {}) as [TipoReclamo, number][]).sort((a, b) => b[1] - a[1]),
    [preview]
  );
  const categoriasExcel = useMemo(() => new Set(desglose.map(([t]) => categoriaTipo(t))), [desglose]);
  const desajuste = Boolean(tipo) && categoriasExcel.size > 0 && !categoriasExcel.has(categoriaTipo(tipo || null));
  const tipoSugerido = preview?.tipoSugerido ?? null;
  const sugeridoEsDanos = categoriaTipo(tipoSugerido) === 'danos';
  const mostrarSelector = !tipoSugerido || modoManual || desajuste;

  // ---------------- Documentos SAP ----------------

  const docsLlenos = sapDocs.filter((d) => d.trim()).length;
  const setDoc = (i: number, v: string) => {
    setSapDocs((docs) => docs.map((d, j) => (j === i ? v : d)));
    quitarAuto('sapDocs');
  };

  // Cada documento SAP lleva su PDF, y el PDF debe traer impreso ese mismo número.
  const agregarPdfsSap = (files: File[]) => {
    const nuevos = files.map((file) => ({ id: ++pdfSeq, file, leyendo: true, numero: null, error: null }));
    setPdfsSap((list) => [...list, ...nuevos]);
    for (const p of nuevos) {
      apiReclamos
        .previsualizarPdfSap(p.file)
        .then((r) => setPdfsSap((list) => list.map((x) => (x.id === p.id ? { ...x, leyendo: false, numero: r.numeroDocumento } : x))))
        .catch((err) =>
          setPdfsSap((list) =>
            list.map((x) => (x.id === p.id ? { ...x, leyendo: false, error: err instanceof ApiError ? err.message : 'No se pudo leer el PDF.' } : x))
          )
        );
    }
  };
  const docsSap = sapDocs.map((d) => d.trim()).filter(Boolean);
  const clavesDocs = new Set(docsSap.map(normalizarDocSap));
  // El mismo documento escrito dos veces (aunque cambien los ceros a la izquierda).
  const docsRepetidos = docsSap.filter((d, i) => docsSap.findIndex((x) => normalizarDocSap(x) === normalizarDocSap(d)) !== i);
  const claveConsulta = [...clavesDocs].sort().join(',');
  useEffect(() => {
    if (!claveConsulta) {
      setDocsUsados(new Map());
      return;
    }
    // Espera a que se deje de escribir; una respuesta vieja no pisa a la nueva.
    let vigente = true;
    setRevisandoDocs(true);
    const t = setTimeout(() => {
      apiReclamos
        .documentosSapUsados(claveConsulta.split(','))
        .then((r) => vigente && setDocsUsados(new Map(r.usados.map((u) => [normalizarDocSap(u.documento), u.reclamos]))))
        .catch(() => vigente && setDocsUsados(new Map())) // si falla, el servidor lo revisa igual al crear
        .finally(() => vigente && setRevisandoDocs(false));
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [claveConsulta]);
  const usadosDe = (doc: string) => docsUsados.get(normalizarDocSap(doc)) ?? null;
  const docsEnOtros = [...new Set(docsSap)].filter((d) => usadosDe(d));
  const vistos = new Set<string>();
  const estadoPdfs = pdfsSap.map((p) => {
    if (p.leyendo) return { pdf: p, ok: false, mensaje: 'Leyendo el número de documento…' };
    if (p.error) return { pdf: p, ok: false, mensaje: p.error };
    if (!p.numero) return { pdf: p, ok: false, mensaje: 'No trae un número de documento SAP legible.' };
    const clave = normalizarDocSap(p.numero);
    if (!clavesDocs.has(clave)) return { pdf: p, ok: false, mensaje: `Es del documento ${p.numero}, que no está en la lista de arriba.` };
    if (vistos.has(clave)) return { pdf: p, ok: false, mensaje: `El documento ${p.numero} ya tiene otro PDF.` };
    vistos.add(clave);
    return { pdf: p, ok: true, mensaje: `Documento ${p.numero}` };
  });
  const pdfDeDoc = (doc: string) => estadoPdfs.find((e) => e.ok && normalizarDocSap(e.pdf.numero || '') === normalizarDocSap(doc))?.pdf ?? null;
  const docsSinPdf = [...new Set(docsSap)].filter((d) => !pdfDeDoc(d));
  const pdfsLeyendo = pdfsSap.some((p) => p.leyendo);
  const pdfsConError = estadoPdfs.filter((e) => !e.ok && !e.pdf.leyendo);

  // Lo que falta para poder crear, con el nombre que ve el usuario.
  const faltantes = [
    !campos.origen && 'Origen',
    campos.origen === 'tienda' && !campos.sucursal.trim() && 'Sucursal',
    !campos.fechaRegistro && 'Fecha',
    campos.origen === 'cedi' && !campos.division.trim() && 'División',
    !campos.proveedor.trim() && 'Proveedor',
    !campos.compradora.trim() && 'Compradora',
    !campos.mundo.trim() && 'Mundo',
    !campos.departamento.trim() && 'Departamento',
    !campos.marca.trim() && 'Marca',
    docsLlenos === 0 && 'Documento SAP',
    !pdfsLeyendo && docsSinPdf.length > 0 && `PDF del documento SAP ${docsSinPdf.join(', ')}`,
  ].filter(Boolean) as string[];

  // ---------------- Adjuntos extra ----------------

  // Los PDF son siempre de documentos SAP: van a su sección para validarlos.
  const agregarAdjuntos = (files: File[]) => {
    const validos = files.filter((f) => esPdf(f) || esExcel(f));
    if (validos.length < files.length) setError('Solo se pueden adjuntar archivos Excel o PDF.');
    setAdjuntos((a) => [...a, ...validos.filter(esExcel)]);
    const pdfs = validos.filter(esPdf);
    if (pdfs.length) agregarPdfsSap(pdfs);
  };

  // ---------------- Envío ----------------

  const excelCedi = soloTienda && preview?.origen === 'cedi';

  // Todos los motivos por los que aún no se puede crear: se muestran en el popup al intentarlo.
  const motivos = [
    !campos.origen && 'Elige el origen del reclamo (Tienda o CEDI).',
    excelCedi && 'El Excel es de la plantilla CEDI: tu rol solo crea reclamos de Tienda.',
    !excel && 'Adjunta el Excel del reclamo: es obligatorio.',
    parsing && 'Se está leyendo el Excel; espera un momento.',
    excel && !parsing && !tipo && 'Selecciona el tipo de reclamo.',
    desajuste && 'El tipo elegido no coincide con lo que indica el Excel.',
    ...[...new Set(docsRepetidos)].map((d) => `El documento SAP ${d} está escrito más de una vez.`),
    ...docsEnOtros.map((d) => `El documento SAP ${d} ya está en ${usadosDe(d)!.map((r) => r.numero).join(', ')}: no se puede crear otro reclamo con el mismo documento.`),
    pdfsLeyendo && 'Se están leyendo los PDF de los documentos SAP; espera un momento.',
    ...pdfsConError.map((e) => `PDF «${e.pdf.file.name}»: ${e.mensaje}`),
    ...(pdfsLeyendo ? [] : docsSinPdf.map((d) => `Falta el PDF del documento SAP ${d}.`)),
    ...faltantes.filter((f) => f !== 'Origen' && !f.startsWith('PDF del documento')).map((f) => `Falta completar: ${f}.`),
  ].filter(Boolean) as string[];
  const bloqueo = motivos[0] ?? null;
  const [popup, setPopup] = useState<{ titulo: string; motivos: string[] } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivos.length || !excel || !tipo) {
      setPopup({ titulo: 'No se puede crear el reclamo', motivos });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('excel', excel);
      form.set('tipo', tipo);
      Object.entries(campos).forEach(([k, v]) => form.set(k, v));
      if (campos.origen !== 'tienda') form.set('sucursal', '');
      if (campos.origen !== 'cedi') form.set('division', '');
      const docs = sapDocs.map((d) => d.trim());
      form.set('sapDoc1', docs[0] || '');
      form.set('sapDoc2', docs[1] || '');
      form.set('sapDoc3', docs[2] || '');
      form.set('sapDocsExtra', JSON.stringify(docs.slice(3).filter(Boolean)));
      pdfsSap.forEach((p) => form.append('pdfs', p.file));

      setProgreso('Creando reclamo…');
      const reclamo = await apiReclamos.crearReclamo(form);
      if (campos.division) invalidarCatalogos();

      // Best-effort: el reclamo ya existe; lo que falle se reintenta desde el detalle.
      const fallidos: string[] = [];
      for (const [i, adj] of adjuntos.entries()) {
        setProgreso(`Subiendo adjunto ${i + 1} de ${adjuntos.length}…`);
        try {
          await apiReclamos.subirAdjunto(reclamo.Token, adj);
        } catch {
          fallidos.push(adj.name);
        }
      }
      onCreated(reclamo, fallidos);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : 'No se pudo crear el reclamo.';
      setError(mensaje);
      setPopup({ titulo: 'No se pudo crear el reclamo', motivos: [mensaje] });
    } finally {
      setSaving(false);
      setProgreso(null);
    }
  };

  const tiposSelector = sugeridoEsDanos && !modoManual && !desajuste ? TIPOS.filter((t) => categoriaTipo(t) === 'danos') : TIPOS;

  // Campos del formulario (se ubican distinto según el origen).
  const campoProveedor = (
    <Field label="Proveedor" tag={tag('proveedor')} resaltar={autos.has('proveedor')}>
      <Combobox
        required
        value={campos.proveedor}
        onChange={(v) => set('proveedor', v)}
        opciones={cat.proveedores}
        placeholder={catalogos ? 'Busca el proveedor' : 'Cargando…'}
        maxLength={200}
      />
    </Field>
  );
  const campoCompradora = (
    <Field label="Compradora" tag={tag('compradora')} resaltar={autos.has('compradora')}>
      {catalogos && cat.compradoras.length === 0 ? (
        <Input required value={campos.compradora} onChange={(e) => set('compradora', e.target.value)} maxLength={150} />
      ) : (
        <Select required value={campos.compradora} onChange={(e) => set('compradora', e.target.value)} disabled={!catalogos}>
          <option value="">{catalogos ? 'Selecciona la compradora' : 'Cargando…'}</option>
          {relacion && relacion.compradoras.length > 0 && (
            <optgroup label="Del proveedor">
              {relacion.compradoras.map((c) => (
                <option key={`p-${c}`} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Todas">
            {cat.compradoras.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
        </Select>
      )}
    </Field>
  );
  const campoMundo = (
    <Field label="Mundo" tag={tag('mundo')} resaltar={autos.has('mundo')}>
      <Combobox required value={campos.mundo} onChange={(v) => set('mundo', v)} opciones={cat.mundos} sugeridas={relacion?.mundos} maxLength={100} />
    </Field>
  );
  const campoDepartamento = (
    <Field label="Departamento" tag={tag('departamento')} resaltar={autos.has('departamento')}>
      <Combobox
        required
        value={campos.departamento}
        onChange={(v) => set('departamento', v)}
        opciones={cat.departamentos}
        sugeridas={relacion?.departamentos}
        maxLength={100}
      />
    </Field>
  );
  const campoMarca = (
    <Field label="Marca" tag={tag('marca')} resaltar={autos.has('marca')}>
      <Combobox required value={campos.marca} onChange={(v) => set('marca', v)} opciones={cat.marcas} sugeridas={relacion?.marcas} maxLength={100} />
    </Field>
  );
  const campoDivision = (
    <Field label="División" tag={tag('division')} resaltar={autos.has('division')}>
      <Combobox
        required
        value={campos.division}
        onChange={(v) => set('division', v)}
        opciones={cat.divisiones}
        nuevoLabel="Agregar división"
        placeholder="Elige o escribe una nueva"
        maxLength={100}
      />
    </Field>
  );
  const campoFactura = (label: string) => (
    <Field label={label} opcional tag={tag('numeroEmbarqueFactura')} resaltar={autos.has('numeroEmbarqueFactura')}>
      <Input value={campos.numeroEmbarqueFactura} onChange={(e) => set('numeroEmbarqueFactura', e.target.value)} maxLength={100} />
    </Field>
  );

  // Cada paso se marca completo con la misma regla que habilita "Crear reclamo".
  const faltanDatos = faltantes.filter((f) => f !== 'Origen' && f !== 'Documento SAP');
  const paso1Completo = Boolean(campos.origen && excel && !parsing && tipo && !desajuste && !excelCedi);
  const paso2Completo = Boolean(campos.origen) && faltanDatos.length === 0;
  const plantilla = esCedi ? 'plantilla CEDI' : campos.origen === 'tienda' || soloTienda ? 'plantilla Tienda' : 'plantilla Tienda o CEDI';

  return (
    <Modal title="Nuevo reclamo" onClose={onClose} wide dismissible={false}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <SeccionForm paso={1} completa={paso1Completo} titulo="Origen y Excel" ayuda="El portal lee el Excel y llena lo que pueda por ti.">
          <div className={cn('grid gap-2', origenes.length > 1 && 'grid-cols-2')} role="radiogroup" aria-label="Origen del reclamo">
            {origenes.map((o) => {
              const Icono = o === 'tienda' ? Store : Warehouse;
              const activo = campos.origen === o;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => elegirOrigen(o)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98]',
                    activo
                      ? 'border-brand-500 bg-brand-500/[0.08] ring-1 ring-brand-500'
                      : 'border-black/10 hover:border-brand-500/40 hover:bg-brand-500/[0.03] dark:border-white/10'
                  )}
                >
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-150', activo ? 'bg-brand-500 text-white' : 'bg-black/[0.05] dark:bg-white/[0.08]')}>
                    <Icono size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{o === 'tienda' ? 'Tienda' : 'CEDI'}</span>
                    <span className="hidden text-xs opacity-60 sm:block">{o === 'tienda' ? 'Recibido en una sucursal' : 'Recibido en el centro de distribución'}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <ZonaArchivo
            icono={FileSpreadsheet}
            titulo={excel ? excel.name : 'Toca para elegir el Excel del reclamo'}
            ayuda={excel ? 'Toca para cambiarlo' : `o suéltalo aquí · ${plantilla}, .xlsx o .xls`}
            accept=".xlsx,.xls"
            activa={Boolean(excel)}
            onArchivos={(fs) => void procesarExcel(fs[0] || null)}
          />

          {parsing && (
            <p className="anim-aparecer flex items-center gap-2 text-sm opacity-70">
              <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" /> Leyendo el Excel y validando los códigos en SAP…
            </p>
          )}
          {excelCedi && (
            <div className="anim-aparecer flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>Este Excel es de la plantilla CEDI. Tu rol solo crea reclamos de Tienda: sube el Excel de la plantilla Tienda.</span>
            </div>
          )}
          {parseError && (
            <div className="anim-aparecer flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
              <span>{parseError} Puedes completar los campos a mano.</span>
            </div>
          )}

          {excel && !parsing && (
            <div className="anim-seccion flex flex-col gap-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-4">
              {preview && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex items-baseline gap-1.5">
                    <span className="cifra-kpi text-[1.75rem] text-brand-700 dark:text-brand-300">{preview.lineasTotal}</span>
                    <span className="text-sm opacity-70">
                      producto{preview.lineasTotal === 1 ? '' : 's'} · plantilla {preview.origen === 'cedi' ? 'CEDI' : 'Tienda'}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'badge-pill',
                      !preview.validacionCodigos.disponible
                        ? 'bg-black/5 dark:bg-white/10'
                        : preview.validacionCodigos.noEncontrados.length
                          ? 'bg-warning/15 text-warning'
                          : 'bg-success/15 text-success'
                    )}
                  >
                    <ScanLine size={12} />
                    {preview.validacionCodigos.disponible
                      ? preview.validacionCodigos.noEncontrados.length
                        ? `${preview.validacionCodigos.noEncontrados.length} código(s) no están en SAP`
                        : 'Todos los códigos existen en SAP'
                      : 'Validación con SAP no disponible'}
                  </span>
                </div>
              )}
              {preview && preview.validacionCodigos.noEncontrados.length > 0 && (
                <p className="rounded-lg bg-warning/10 px-2 py-1 font-mono text-xs">{preview.validacionCodigos.noEncontrados.join(', ')}</p>
              )}

              {desglose.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="etiqueta">Tipos leídos del Excel</span>
                    {!modoManual && (
                      <button type="button" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400" onClick={() => setModoManual(true)}>
                        Cambiar manualmente
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {desglose.map(([t, n]) => (
                      <TipoBadge key={t} tipo={t} count={n} activo={categoriaTipo(t) === categoriaTipo(tipo || null)} />
                    ))}
                  </div>
                  {preview && preview.lineasSinMotivo > 0 && (
                    <p className="text-xs opacity-60">{preview.lineasSinMotivo} producto(s) sin motivo reconocible tomarán el tipo del reclamo.</p>
                  )}
                  {tipo && (
                    <p className="text-sm">
                      Tipo del reclamo: <strong>{TIPO_LABEL[tipo]}</strong>
                      {TIPOS_SOLO_NOTIFICACION.has(tipo) && <span className="opacity-60"> · solo notificación</span>}
                    </p>
                  )}
                  {desglose.length > 1 && <p className="text-xs opacity-60">Cada producto conserva su propio motivo; el tipo del reclamo es el más frecuente.</p>}
                </>
              )}

              {sugeridoEsDanos && !mostrarSelector && <span className="text-xs opacity-70">El Excel no distingue el subtipo de daños: confirma cuál aplica.</span>}

              {(mostrarSelector || sugeridoEsDanos) && (
                <div className="flex flex-col gap-2">
                  {!tipoSugerido && <span className="etiqueta">{preview ? 'El Excel no trae un motivo reconocible: elige el tipo' : 'Tipo de reclamo'}</span>}
                  <div className="flex flex-wrap gap-2">
                    {tiposSelector.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipo(t)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-95',
                          tipo === t
                            ? 'border-brand-500 bg-brand-500 text-white dark:bg-brand-400 dark:text-slate-950'
                            : 'border-black/10 hover:border-brand-500/50 dark:border-white/15'
                        )}
                      >
                        {TIPO_LABEL_CORTO[t]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {desajuste && (
                <div className="anim-aparecer flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    «{TIPO_LABEL_CORTO[tipo as TipoReclamo]}» no coincide con lo que indica el Excel ({desglose.map(([t]) => TIPO_LABEL_CORTO[t]).join(', ')}). Corrige el
                    tipo o revisa el archivo.
                  </span>
                </div>
              )}

              {preview && autos.size > 0 && (
                <p className="flex items-start gap-2 text-sm text-success">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {autos.size === 1 ? 'Se llenó 1 campo solo' : `Se llenaron ${autos.size} campos solos`} (marcados <TagAuto />). Revísalos abajo.
                  </span>
                </p>
              )}
            </div>
          )}
        </SeccionForm>

        {campos.origen && (
          <SeccionForm
            paso={2}
            completa={paso2Completo}
            className="anim-seccion"
            titulo="Datos del reclamo"
            ayuda={faltanDatos.length ? `Te falta: ${faltanDatos.join(', ')}.` : 'Todo completo. Revisa que los datos sean correctos.'}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {esCedi ? (
                <>
                  {campoProveedor}
                  {campoMarca}
                  {campoDivision}
                  {campoFactura('Factura / Embarque')}
                </>
              ) : (
                <>
                  <Field label="Sucursal" tag={tag('sucursal')} resaltar={autos.has('sucursal')}>
                    <Input list="reclamos-tiendas" required value={campos.sucursal} onChange={(e) => set('sucursal', e.target.value)} maxLength={150} />
                    <datalist id="reclamos-tiendas">
                      {tiendas.map((t) => (
                        <option key={t.TiendaId} value={t.Nombre} />
                      ))}
                    </datalist>
                  </Field>
                  {campoFactura('N° embarque / factura')}
                  {campoProveedor}
                  {campoMarca}
                </>
              )}
              <Field label="Fecha de registro" tag={tag('fechaRegistro')} resaltar={autos.has('fechaRegistro')}>
                <Input type="date" required value={campos.fechaRegistro} onChange={(e) => set('fechaRegistro', e.target.value)} />
              </Field>
              {campoCompradora}
              {campoMundo}
              {campoDepartamento}
            </div>
          </SeccionForm>
        )}

        <SeccionForm
          paso={3}
          completa={docsLlenos > 0 && docsSinPdf.length === 0 && !pdfsLeyendo && pdfsConError.length === 0 && !docsRepetidos.length && !docsEnOtros.length && !revisandoDocs}
          titulo="Documentos SAP"
          ayuda="Al menos uno: el número del documento en SAP y su PDF, que debe traer ese mismo número."
        >
          <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-3', autos.has('sapDocs') && 'campo-auto')}>
            {sapDocs.map((d, i) => (
              <div key={i} className="anim-aparecer flex items-center gap-1">
                <Input aria-label={`Documento SAP ${i + 1}`} placeholder={`Documento ${i + 1}`} value={d} onChange={(e) => setDoc(i, e.target.value)} maxLength={50} className="font-mono" />
                {i >= 3 && (
                  <button
                    type="button"
                    aria-label="Quitar documento"
                    className="rounded-full p-1.5 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    onClick={() => setSapDocs((docs) => docs.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex w-fit items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
              onClick={() => setSapDocs((docs) => [...docs, ''])}
            >
              <Plus size={14} /> Agregar otro documento
            </button>
            {tag('sapDocs')}
          </div>

          {docsSap.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {[...new Set(docsSap)].map((d) => {
                const pdf = pdfDeDoc(d);
                const usados = usadosDe(d);
                const repetido = docsRepetidos.includes(d);
                return (
                  <li key={d} className="anim-aparecer flex items-center gap-2 text-sm">
                    {usados || repetido ? (
                      <AlertTriangle size={15} className="shrink-0 text-danger" />
                    ) : pdf ? (
                      <CheckCircle2 size={15} className="shrink-0 text-success" />
                    ) : (
                      <AlertTriangle size={15} className="shrink-0 text-warning" />
                    )}
                    <span className="font-mono">{d}</span>
                    {usados ? (
                      <span className="min-w-0 truncate font-semibold text-danger" title={`Ya está en ${usados.map((r) => r.numero).join(', ')}`}>
                        Ya está en {usados.map((r) => r.numero).join(', ')}
                      </span>
                    ) : repetido ? (
                      <span className="min-w-0 truncate font-semibold text-danger">Escrito más de una vez</span>
                    ) : (
                      <span className={cn('min-w-0 truncate', pdf ? 'opacity-65' : 'text-warning')}>{pdf ? pdf.file.name : 'Falta su PDF'}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {estadoPdfs.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {estadoPdfs.map(({ pdf, ok, mensaje }) => (
                <li
                  key={pdf.id}
                  className={cn(
                    'anim-aparecer flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                    ok || pdf.leyendo ? 'border-black/10 dark:border-white/10' : 'border-danger/30 bg-danger/10'
                  )}
                >
                  {pdf.leyendo ? (
                    <LoaderCircle size={16} className="shrink-0 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <FileText size={16} className="shrink-0 text-brand-600 dark:text-brand-400" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{pdf.file.name}</span>
                    <span className={cn('block text-xs', ok ? 'text-success' : pdf.leyendo ? 'opacity-60' : 'text-danger')}>{mensaje}</span>
                  </span>
                  <button type="button" aria-label="Vista previa" className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setVerAdjunto(pdf.file)}>
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar PDF"
                    className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setPdfsSap((list) => list.filter((x) => x.id !== pdf.id))}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ZonaArchivo
            compacta
            multiple
            icono={FileText}
            titulo={pdfsSap.length ? 'Agregar otro PDF' : 'Agregar los PDF de los documentos SAP'}
            ayuda="o suéltalos aquí · un PDF por documento"
            accept=".pdf,application/pdf"
            onArchivos={(fs) => {
              const pdfs = fs.filter(esPdf);
              if (pdfs.length < fs.length) setError('Los documentos SAP deben subirse en PDF.');
              if (pdfs.length) agregarPdfsSap(pdfs);
            }}
          />
        </SeccionForm>

        <SeccionForm paso={4} titulo="Archivos y comentario" ayuda="Opcional: Excel adicionales y un comentario. Los PDF van en Documentos SAP.">
          {adjuntos.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {adjuntos.map((a, i) => (
                <li key={`${a.name}-${i}`} className="anim-aparecer flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                  {esPdf(a) ? <FileText size={16} className="shrink-0 text-brand-600 dark:text-brand-400" /> : <FileSpreadsheet size={16} className="shrink-0 text-success" />}
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <button type="button" aria-label="Vista previa" className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setVerAdjunto(a)}>
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar adjunto"
                    className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setAdjuntos((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ZonaArchivo
            compacta
            multiple
            icono={Paperclip}
            titulo={adjuntos.length ? 'Agregar otro archivo' : 'Agregar archivos'}
            ayuda="o suéltalos aquí · Excel"
            accept=".xlsx,.xls"
            onArchivos={agregarAdjuntos}
          />
          <Field label="Comentario" opcional tag={tag('comentario')} resaltar={autos.has('comentario')}>
            <Textarea rows={2} value={campos.comentario} onChange={(e) => set('comentario', e.target.value)} maxLength={1000} />
          </Field>
        </SeccionForm>

        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.07] bg-[var(--glass-bg)] px-6 py-4 dark:border-white/[0.08]">
          {(progreso || bloqueo) && (
            <span key={progreso || bloqueo} className={cn('anim-aparecer w-full text-sm sm:mr-auto sm:w-auto', desajuste ? 'text-danger' : 'opacity-65')}>
              {progreso || bloqueo}
            </span>
          )}
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} aria-disabled={Boolean(bloqueo)} className={cn(bloqueo && 'opacity-60')}>
            <Upload size={15} /> {saving ? 'Guardando…' : 'Crear reclamo'}
          </Button>
        </div>
      </form>

      {popup && (
        <Modal title={popup.titulo} onClose={() => setPopup(null)} layer="z-[60]">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-sm">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
              <ul className="flex min-w-0 flex-col gap-1.5">
                {popup.motivos.map((m) => (
                  <li key={m} className="break-words">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end">
              <Button type="button" autoFocus onClick={() => setPopup(null)}>
                Entendido
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {verAdjunto &&
        (esPdf(verAdjunto) ? (
          <PdfPreviewModal titulo={verAdjunto.name} cargar={async () => verAdjunto} onClose={() => setVerAdjunto(null)} />
        ) : (
          <ExcelPreviewModal titulo={verAdjunto.name} cargar={() => verAdjunto.arrayBuffer()} onClose={() => setVerAdjunto(null)} />
        ))}
    </Modal>
  );
}
