// src/components/admin/ImportJSONWithPreview.tsx
import { useState } from "react";
import { Upload, Loader2, FileJson, CheckCircle, XCircle, Lightbulb, Eye, Trash2, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface ImportJSONWithPreviewProps<T> {
  onImport: (items: T[]) => Promise<ImportResult>;
  promptSuggestion: string;
  disabled?: boolean;
  entityName: string; // "Startups", "Comunidades", "Eventos", etc.
  renderPreviewItem: (item: T, index: number) => React.ReactNode; // Función para renderizar cada item
  validateItem?: (item: T) => boolean; // Validación opcional
  getItemKey: (item: T, index: number) => string | number; // Key única para cada item
}

export default function ImportJSONWithPreview<T>({
  onImport,
  promptSuggestion,
  disabled = false,
  entityName,
  renderPreviewItem,
  validateItem,
  getItemKey,
}: ImportJSONWithPreviewProps<T>) {
  const [importLoading, setImportLoading] = useState(false);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [parsedItems, setParsedItems] = useState<T[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [importResults, setImportResults] = useState<ImportResult>({
    success: 0,
    failed: 0,
    errors: [],
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Asumimos que el JSON es un array de items
      const items: T[] = Array.isArray(data) ? data : [data];

      // Validar items si se proporciona función de validación
      const validItems = validateItem
        ? items.filter((item, index) => {
            const isValid = validateItem(item);
            if (!isValid) {
              console.warn(`Item ${index} es inválido:`, item);
            }
            return isValid;
          })
        : items;

      if (validItems.length === 0) {
        toast.error("No se encontraron items válidos en el archivo JSON");
        event.target.value = "";
        return;
      }

      setParsedItems(validItems);
      // Seleccionar todos por defecto
      setSelectedItems(new Set(validItems.map((_, index) => index)));
      setPreviewDialogOpen(true);
    } catch (error: any) {
      console.error("Error parsing JSON:", error);
      toast.error(`Error al leer el archivo JSON: ${error.message}`);
    } finally {
      // Reset input
      event.target.value = "";
    }
  };

  const handleConfirmImport = async () => {
    const itemsToImport = parsedItems.filter((_, index) => selectedItems.has(index));

    if (itemsToImport.length === 0) {
      toast.error("Debes seleccionar al menos un item para importar");
      return;
    }

    setImportLoading(true);
    setImportResults({ success: 0, failed: 0, errors: [] });

    try {
      const results = await onImport(itemsToImport);
      setImportResults(results);

      if (results.success > 0) {
        toast.success(`${results.success} ${entityName.toLowerCase()} importados exitosamente`);
      }

      if (results.failed > 0) {
        toast.error(`${results.failed} ${entityName.toLowerCase()} fallaron al importar`);
      }

      setPreviewDialogOpen(false);
      setResultsDialogOpen(true);
    } catch (error: any) {
      console.error("Error importing items:", error);
      toast.error(`Error al importar: ${error.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const toggleItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === parsedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(parsedItems.map((_, index) => index)));
    }
  };

  const copyPromptToClipboard = () => {
    navigator.clipboard.writeText(promptSuggestion);
    toast.success("Prompt copiado al portapapeles");
  };

  const allSelected = selectedItems.size === parsedItems.length;
  const someSelected = selectedItems.size > 0 && selectedItems.size < parsedItems.length;

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
            <Upload className="w-4 h-4 mr-2" />
            Importar JSON
          </Button>
        </div>
      </div>

      {/* Dialog de Preview */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Previsualización de Importación
            </DialogTitle>
            <DialogDescription>
              Revisa y selecciona los {entityName.toLowerCase()} que deseas importar ({selectedItems.size} de {parsedItems.length} seleccionados)
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 py-2 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              className="gap-2"
            >
              {allSelected ? (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Deseleccionar todos
                </>
              ) : (
                <>
                  <Square className="h-4 w-4" />
                  Seleccionar todos
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} seleccionado{selectedItems.size !== 1 ? 's' : ''}
            </span>
          </div>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3 py-4">
              {parsedItems.map((item, index) => {
                const isSelected = selectedItems.has(index);
                return (
                  <Card
                    key={getItemKey(item, index)}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => toggleItem(index)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleItem(index)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          {renderPreviewItem(item, index)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPreviewDialogOpen(false)}
              disabled={importLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={importLoading || selectedItems.size === 0}
            >
              {importLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Importar {selectedItems.size} {entityName.toLowerCase()}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
