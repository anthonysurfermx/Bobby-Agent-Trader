// src/components/admin/ImportJSONButton.tsx
import { useState } from "react";
import { Upload, Loader2, FileJson, CheckCircle, XCircle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface ImportJSONButtonProps {
  onImport: (file: File) => Promise<ImportResult>;
  promptSuggestion: string;
  disabled?: boolean;
  entityName: string; // "Startups", "Comunidades", "Eventos", etc.
}

export default function ImportJSONButton({
  onImport,
  promptSuggestion,
  disabled = false,
  entityName,
}: ImportJSONButtonProps) {
  const [importLoading, setImportLoading] = useState(false);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult>({
    success: 0,
    failed: 0,
    errors: [],
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportResults({ success: 0, failed: 0, errors: [] });

    try {
      const results = await onImport(file);
      setImportResults(results);

      if (results.success > 0) {
        toast.success(`${results.success} ${entityName.toLowerCase()} importados exitosamente`);
      }

      if (results.failed > 0) {
        toast.error(`${results.failed} ${entityName.toLowerCase()} fallaron al importar`);
      }

      setResultsDialogOpen(true);
    } catch (error: any) {
      console.error("Error importing JSON:", error);
      toast.error(`Error al procesar el archivo: ${error.message}`);
    } finally {
      setImportLoading(false);
      // Reset input
      event.target.value = "";
    }
  };

  const copyPromptToClipboard = () => {
    navigator.clipboard.writeText(promptSuggestion);
    toast.success("Prompt copiado al portapapeles");
  };

  return (
    <>
      <div className="flex gap-2">
        {/* Botón Sugerencia de Prompt */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPromptDialogOpen(true)}
              >
                <Lightbulb className="w-4 h-4 text-yellow-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Ver sugerencia de prompt para GPT</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Botón Importar JSON */}
        <div className="relative">
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
            id={`json-upload-${entityName}`}
            disabled={importLoading || disabled}
          />
          <Button
            variant="outline"
            onClick={() => document.getElementById(`json-upload-${entityName}`)?.click()}
            disabled={importLoading || disabled}
          >
            {importLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar JSON
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Dialog de Sugerencia de Prompt */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Sugerencia de Prompt para GPT
            </DialogTitle>
            <DialogDescription>
              Usa este prompt con GPT-5 o ChatGPT para generar el archivo JSON de {entityName.toLowerCase()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                  {promptSuggestion}
                </pre>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button onClick={copyPromptToClipboard} className="flex-1">
                Copiar Prompt
              </Button>
              <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Resultados */}
      <Dialog open={resultsDialogOpen} onOpenChange={setResultsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              Resultados de Importación
            </DialogTitle>
            <DialogDescription>
              Resumen de la importación de {entityName.toLowerCase()} desde JSON
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Exitosos</p>
                      <p className="text-2xl font-bold text-green-600">{importResults.success}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Fallidos</p>
                      <p className="text-2xl font-bold text-red-600">{importResults.failed}</p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Errores */}
            {importResults.errors.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 text-red-600">Errores encontrados:</h3>
                <Card>
                  <CardContent className="pt-4">
                    <ul className="space-y-2 max-h-60 overflow-y-auto">
                      {importResults.errors.map((error, index) => (
                        <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">•</span>
                          <span>{error}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Mensaje de éxito */}
            {importResults.success > 0 && importResults.failed === 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  ¡Todos los registros se importaron exitosamente!
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setResultsDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
