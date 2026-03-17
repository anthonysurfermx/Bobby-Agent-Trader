// src/pages/admin/ContentMachine.tsx
// Content Machine — Dashboard privado para generar los 6 outputs de contenido

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Upload,
  FileAudio,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';

// ─── Types ───────────────────────────────────────────────────────────────────

type ProcessingStatus = 'idle' | 'uploading' | 'transcribing' | 'generating' | 'done' | 'error';

interface Outputs {
  linkedin_post: string;
  linkedin_article: string;
  twitter_thread: string;
  twitter_post: string;
  video_script: string;
  defimexico_article: string;
}

interface OutputTab {
  key: keyof Outputs;
  label: string;
  emoji: string;
  description: string;
}

const OUTPUT_TABS: OutputTab[] = [
  { key: 'linkedin_post', label: 'LinkedIn Post', emoji: '💼', description: 'Inglés · 150-250 palabras' },
  { key: 'linkedin_article', label: 'LinkedIn Article', emoji: '📝', description: 'Inglés · 700-900 palabras' },
  { key: 'twitter_thread', label: 'Twitter Thread', emoji: '🧵', description: 'Español · 7 tweets' },
  { key: 'twitter_post', label: 'Twitter Post', emoji: '⚡', description: 'Español · 180 chars' },
  { key: 'video_script', label: 'Video Script + Veo 3', emoji: '🎬', description: 'Español · 75s + prompts anime' },
  { key: 'defimexico_article', label: 'Artículo DeFi México', emoji: '🌎', description: 'Español · SEO completo' },
];

const STATUS_MESSAGES: Record<ProcessingStatus, string> = {
  idle: '',
  uploading: 'Subiendo archivo...',
  transcribing: 'Transcribiendo con Whisper...',
  generating: 'Claude generando los 6 outputs...',
  done: 'Listo para publicar',
  error: 'Error en el procesamiento',
};

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

// ─── OutputCard ──────────────────────────────────────────────────────────────

function OutputCard({ tab, content }: { tab: OutputTab; content: string }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{tab.emoji}</span>
          <div>
            <h3 className="font-semibold">{tab.label}</h3>
            <p className="text-xs text-muted-foreground">{tab.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={content} />
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t p-4">
          <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-foreground bg-muted/30 rounded-lg p-4 overflow-auto max-h-[500px]">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── DropZone ────────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  file,
  disabled,
}: {
  onFile: (f: File) => void;
  file: File | null;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped && dropped.type.startsWith('audio/')) {
        onFile(dropped);
      } else {
        toast.error('Solo se aceptan archivos de audio (MP3, M4A, WAV)');
      }
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
        ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${file ? 'border-green-500/50 bg-green-500/5' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      {file ? (
        <div className="flex flex-col items-center gap-2">
          <FileAudio className="h-10 w-10 text-green-500" />
          <p className="font-medium text-green-600 dark:text-green-400">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
          <p className="text-xs text-muted-foreground">Click para cambiar</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Arrastra tu Audio Overview aquí</p>
          <p className="text-sm text-muted-foreground">o click para seleccionar</p>
          <p className="text-xs text-muted-foreground mt-1">MP3, M4A, WAV · máx 50MB</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContentMachine() {
  const { user } = useAuth();

  // Form state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [inputText, setInputText] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('founders-latam');

  // Processing state
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [outputs, setOutputs] = useState<Outputs | null>(null);
  const [activeTab, setActiveTab] = useState<keyof Outputs>('linkedin_post');
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isProcessing = ['uploading', 'transcribing', 'generating'].includes(status);

  const handleSubmit = async () => {
    if (!audioFile && !inputText.trim()) {
      toast.error('Sube un audio o escribe un texto para procesar');
      return;
    }

    setStatus('uploading');
    setOutputs(null);
    setErrorMsg('');

    try {
      // 1. Crear job en Supabase
      const insertPayload: Record<string, unknown> = {
        source_type: audioFile ? (inputText ? 'both' : 'audio') : 'text',
        source_label: sourceLabel || null,
        topic: topic || null,
        audience: audience || 'founders-latam',
        status: 'pending',
        input_text: inputText.trim() || null,
      };
      if (user?.id) insertPayload.created_by = user.id;

      const { data: job, error: jobError } = await supabase
        .from('content_machine_jobs')
        .insert(insertPayload)
        .select('id')
        .single();

      if (jobError || !job) throw new Error(jobError?.message || 'No se pudo crear el job');
      setJobId(job.id);

      // 2. Subir audio directamente a Supabase Storage (evita límite de 4.5MB de Vercel)
      if (audioFile) {
        const ext = audioFile.name.split('.').pop() || 'mp3';
        const storagePath = `${job.id}/audio.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('content-machine-audio')
          .upload(storagePath, audioFile, { contentType: 'audio/mpeg' });

        if (uploadError) throw new Error(`Error subiendo audio: ${uploadError.message}`);

        // Guardar la ruta del storage en el job
        await supabase
          .from('content_machine_jobs')
          .update({ audio_storage_path: storagePath, audio_filename: audioFile.name })
          .eq('id', job.id);
      }

      // 3. Llamar a la Vercel function con solo el job_id (~50 bytes)
      setStatus('transcribing');

      const response = await fetch('/api/content-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: job.id }),
      });

      if (!response.ok) {
        let errMsg = 'Error en el servidor';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `Error ${response.status}: ${response.statusText}`;
        }
        throw new Error(errMsg);
      }

      setStatus('generating');
      const data = await response.json();

      if (!data.ok) throw new Error(data.error || 'Error generando outputs');

      setOutputs(data.outputs);
      setStatus('done');
      toast.success('Contenido generado. Revisa los 6 outputs.');

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(msg);
      setStatus('error');
      toast.error(msg);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setOutputs(null);
    setAudioFile(null);
    setInputText('');
    setSourceLabel('');
    setTopic('');
    setAudience('founders-latam');
    setJobId(null);
    setErrorMsg('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Content Machine
          </h2>
          <p className="text-muted-foreground mt-1">
            1 input → 6 outputs listos para publicar
          </p>
        </div>
        {status === 'done' && (
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Nuevo contenido
          </Button>
        )}
      </div>

      {/* Form — solo visible si no hay outputs */}
      {status !== 'done' && (
        <div className="space-y-6 border rounded-xl p-6 bg-card">
          <h3 className="font-semibold text-lg">Input</h3>

          {/* Audio */}
          <div className="space-y-2">
            <Label>Audio Overview de NotebookLM (opcional)</Label>
            <DropZone
              onFile={setAudioFile}
              file={audioFile}
              disabled={isProcessing}
            />
          </div>

          {/* Texto */}
          <div className="space-y-2">
            <Label htmlFor="input-text">
              Texto adicional o input directo (opcional si subes audio)
            </Label>
            <Textarea
              id="input-text"
              placeholder="Pega notas, ideas, resumen de NotebookLM en texto..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isProcessing}
              rows={5}
              className="resize-none font-mono text-sm"
            />
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source-label">Fuente</Label>
              <Input
                id="source-label"
                placeholder="Invest Like the Best Ep 123"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Tema central</Label>
              <Input
                id="topic"
                placeholder="Uniswap v4 hooks"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <Label>Audiencia</Label>
              <Select value={audience} onValueChange={setAudience} disabled={isProcessing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="founders-latam">Founders LATAM</SelectItem>
                  <SelectItem value="developers">Developers Web3</SelectItem>
                  <SelectItem value="instituciones">Instituciones DeFi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || (!audioFile && !inputText.trim())}
            className="w-full gap-2 h-12 text-base"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {STATUS_MESSAGES[status]}
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Generar 6 outputs
              </>
            )}
          </Button>

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Progress indicator mientras procesa */}
      {isProcessing && (
        <div className="border rounded-xl p-6 bg-card space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="font-medium">{STATUS_MESSAGES[status]}</span>
          </div>
          <div className="space-y-2">
            {[
              { step: 'uploading', label: 'Subiendo archivo' },
              { step: 'transcribing', label: 'Transcribiendo con Whisper' },
              { step: 'generating', label: 'Claude generando los 6 outputs' },
            ].map(({ step, label }) => {
              const steps = ['uploading', 'transcribing', 'generating'];
              const currentIdx = steps.indexOf(status);
              const stepIdx = steps.indexOf(step);
              const isDone = stepIdx < currentIdx;
              const isActive = stepIdx === currentIdx;
              return (
                <div key={step} className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isDone ? 'bg-green-500' :
                    isActive ? 'bg-primary animate-pulse' :
                    'bg-muted-foreground/30'
                  }`} />
                  <span className={isDone ? 'text-muted-foreground line-through' : isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    {label}
                  </span>
                  {isDone && <Check className="h-3 w-3 text-green-500" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Outputs */}
      {status === 'done' && outputs && (
        <div className="space-y-4">
          {/* Tab selector */}
          <div className="flex gap-2 flex-wrap">
            {OUTPUT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-accent'
                }`}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>

          {/* Output activo */}
          {OUTPUT_TABS.map((tab) =>
            activeTab === tab.key ? (
              <OutputCard key={tab.key} tab={tab} content={outputs[tab.key]} />
            ) : null
          )}

          {/* Todos los outputs colapsados */}
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-3 font-medium">Todos los outputs</p>
            <div className="space-y-3">
              {OUTPUT_TABS.filter((t) => t.key !== activeTab).map((tab) => (
                <OutputCard key={tab.key} tab={tab} content={outputs[tab.key]} />
              ))}
            </div>
          </div>

          {/* Job ID para referencia */}
          {jobId && (
            <p className="text-xs text-muted-foreground text-right">
              Job ID: {jobId}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
