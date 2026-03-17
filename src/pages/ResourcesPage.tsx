import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Wrench, PlayCircle, ExternalLink } from "lucide-react";

type Resource = {
  id: string;
  title: string;
  kind: "guia" | "herramienta" | "tutorial";
  description: string;
  url: string;
};

// Servicio temporal - después lo conectaremos con Supabase
async function fetchResources(): Promise<Resource[]> {
  // Simulamos una llamada a API
  await new Promise(r => setTimeout(r, 500));
  return [
    { id: "r1", title: "Guía: DeFi 101", kind: "guia", description: "Conceptos básicos y primeros pasos.", url: "https://example.com/defi101" },
    { id: "r2", title: "Herramienta: Uniswap Analytics", kind: "herramienta", description: "KPIs y análisis en tiempo real.", url: "https://info.uniswap.org/" },
    { id: "r3", title: "Tutorial: LP en V3", kind: "tutorial", description: "Cómo proveer liquidez concentrada.", url: "https://example.com/lp-v3" },
  ];
}

function ResourceSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-28" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function ResourceList({ items }: { items: Resource[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No hay elementos todavía.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((r) => (
        <Card key={r.id} className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2">
              <span>{r.title}</span>
              <Badge variant="secondary" className="capitalize">{r.kind}</Badge>
            </CardTitle>
            <CardDescription>{r.description}</CardDescription>
          </CardHeader>
          <CardFooter className="mt-auto">
            <Button asChild className="gap-2">
              <a href={r.url} target="_blank" rel="noreferrer">
                Abrir <ExternalLink className="h-4 w-4"/>
              </a>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export default function ResourcesPage() {
  const [data, setData] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchResources()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err : new Error('Failed to load resources')))
      .finally(() => setLoading(false));
  }, []);

  const guides = data.filter(r => r.kind === "guia");
  const tools = data.filter(r => r.kind === "herramienta");
  const tutorials = data.filter(r => r.kind === "tutorial");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Recursos</h1>
        <p className="text-muted-foreground">Guías, herramientas y tutoriales para acelerar tu camino.</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="guias">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="guias" className="gap-2">
            <BookOpen className="h-4 w-4"/>Guías
          </TabsTrigger>
          <TabsTrigger value="herramientas" className="gap-2">
            <Wrench className="h-4 w-4"/>Herramientas
          </TabsTrigger>
          <TabsTrigger value="tutoriales" className="gap-2">
            <PlayCircle className="h-4 w-4"/>Tutoriales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guias" className="mt-6">
          {loading ? <ResourceSkeleton /> : <ResourceList items={guides} />}
        </TabsContent>
        <TabsContent value="herramientas" className="mt-6">
          {loading ? <ResourceSkeleton /> : <ResourceList items={tools} />}
        </TabsContent>
        <TabsContent value="tutoriales" className="mt-6">
          {loading ? <ResourceSkeleton /> : <ResourceList items={tutorials} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}