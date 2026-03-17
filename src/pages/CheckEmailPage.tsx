import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Mail, ArrowLeft, RefreshCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

export default function CheckEmailPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const [cooldown, setCooldown] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown(c => c > 0 ? c - 1 : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  const handleResend = async () => {
    if (cooldown > 0) return;
    setCooldown(60);
    toast.success('Email de verificación reenviado');
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Revisa tu correo</CardTitle>
          <CardDescription>
            Hemos enviado un enlace de verificación a:
            <span className="block font-medium text-foreground mt-2">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Haz clic en el enlace del correo para confirmar tu cuenta.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Button onClick={handleResend} variant="outline" className="w-full" disabled={cooldown > 0}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar correo'}
            </Button>
            <Button variant="default" className="w-full" asChild>
              <Link to="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al login
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}