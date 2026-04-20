import { useState } from 'react';
import { PIPELINE_LABELS, PipelinePrevisional } from '../../types/previsional';

export interface PrevisionalFilters {
  desde: string;
  hasta: string;
  pipeline: PipelinePrevisional | '';
  responsable: string;
  sexo: string;
  edad: string;
}

export default function PrevisionalFilters({ value, onChange, responsables }:{
  value: PrevisionalFilters;
  onChange: (v: PrevisionalFilters) => void;
  responsables: string[];
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Desde</label>
        <input type="date" value={value.desde} onChange={e => onChange({ ...value, desde: e.target.value })} className="input-dark" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Hasta</label>
        <input type="date" value={value.hasta} onChange={e => onChange({ ...value, hasta: e.target.value })} className="input-dark" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Pipeline</label>
        <select value={value.pipeline} onChange={e => onChange({ ...value, pipeline: e.target.value as PipelinePrevisional | '' })} className="input-dark">
          <option value="">Todos</option>
          {Object.entries(PIPELINE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Responsable</label>
        <select value={value.responsable} onChange={e => onChange({ ...value, responsable: e.target.value })} className="input-dark">
          <option value="">Todos</option>
          {responsables.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Sexo</label>
        <select value={value.sexo} onChange={e => onChange({ ...value, sexo: e.target.value })} className="input-dark">
          <option value="">Todos</option>
          <option value="HOMBRE">Hombre</option>
          <option value="MUJER">Mujer</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Edad</label>
        <select value={value.edad} onChange={e => onChange({ ...value, edad: e.target.value })} className="input-dark">
          <option value="">Todas</option>
          <option value="<50">Menos de 50</option>
          <option value="50-60">50 a 60</option>
          <option value=">60">Más de 60</option>
        </select>
      </div>
    </div>
  );
}
