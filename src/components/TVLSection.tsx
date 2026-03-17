import React, { useState } from 'react';

interface DefiLlamaTVLWidgetProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  chain?: string;
  theme?: 'dark' | 'light';
  title?: string;
}

export const DefiLlamaTVLWidget: React.FC<DefiLlamaTVLWidgetProps> = ({
  className = "",
  width = "100%",
  height = 400,
  chain = "All",
  theme = "dark",
  title = "Total Value Locked (TVL) - DeFi Global"
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const iframeUrl = `https://defillama.com/chart/chain/${chain}?theme=${theme}`;

  const handleIframeLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 overflow-hidden ${className}`}>
      {/* Header del widget */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {title}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Datos en tiempo real proporcionados por DefiLlama
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <a 
              href="https://defillama.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-900 text-blue-200 hover:bg-blue-800 transition-colors"
            >
              📊 DefiLlama
            </a>
          </div>
        </div>
      </div>

      {/* Container del iframe */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400 mx-auto mb-4"></div>
              <p className="text-gray-400">Cargando datos de TVL...</p>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="text-red-400 text-4xl mb-4">⚠️</div>
              <p className="text-gray-400 mb-2">Error al cargar los datos</p>
              <a 
                href={iframeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Ver en DefiLlama
              </a>
            </div>
          </div>
        )}

        <iframe
          src={iframeUrl}
          title="DefiLlama TVL Chart"
          width={width}
          height={height}
          frameBorder="0"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          className="w-full"
          style={{ 
            minHeight: typeof height === 'number' ? `${height}px` : height,
            display: hasError ? 'none' : 'block'
          }}
          allowFullScreen
        />
      </div>

      {/* Footer con información adicional */}
      <div className="px-6 py-3 bg-gray-800 text-xs text-gray-400">
        <div className="flex items-center justify-between">
          <span>
            Actualizado en tiempo real • Fuente: DefiLlama
          </span>
          <span className="flex items-center space-x-4">
            <a 
              href="https://docs.llama.fi/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              Documentación
            </a>
            <a 
              href="https://defillama.com/docs/api"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              API
            </a>
          </span>
        </div>
      </div>
    </div>
  );
};

// Variantes específicas para diferentes chains
export const DefiMexicoTVLWidget: React.FC<Omit<DefiLlamaTVLWidgetProps, 'chain' | 'title'>> = (props) => (
  <DefiLlamaTVLWidget
    {...props}
    chain="All"
    title="Total Value Locked - DeFi Global"
  />
);

export const EthereumTVLWidget: React.FC<Omit<DefiLlamaTVLWidgetProps, 'chain' | 'title'>> = (props) => (
  <DefiLlamaTVLWidget
    {...props}
    chain="Ethereum"
    title="Total Value Locked - Ethereum"
  />
);

export const PolygonTVLWidget: React.FC<Omit<DefiLlamaTVLWidgetProps, 'chain' | 'title'>> = (props) => (
  <DefiLlamaTVLWidget
    {...props}
    chain="Polygon"
    title="Total Value Locked - Polygon"
  />
);

// Componente principal para usar en la página
export default DefiLlamaTVLWidget;