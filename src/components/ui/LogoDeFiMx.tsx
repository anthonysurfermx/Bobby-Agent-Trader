import { motion } from "framer-motion";

interface LogoDeFiMxProps {
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}

const LogoDeFiMx = ({ size = "md", animated = false, className = "" }: LogoDeFiMxProps) => {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10", 
    lg: "w-12 h-12"
  };

  const MotionWrapper = animated ? motion.div : "div";

  return (
    <MotionWrapper
      className={`${sizeClasses[size]} ${className}`}
      {...(animated && {
        whileHover: { scale: 1.05 },
        whileTap: { scale: 0.95 }
      })}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Background circle with gradient */}
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(268, 100%, 70%)" />
            <stop offset="100%" stopColor="hsl(195, 100%, 75%)" />
          </linearGradient>
          <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="white" />
            <stop offset="100%" stopColor="hsl(268, 50%, 90%)" />
          </linearGradient>
        </defs>
        
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="url(#logoGradient)"
          className="drop-shadow-lg"
        />
        
        {/* Inner glow effect */}
        <circle
          cx="50"
          cy="50"
          r="35"
          fill="none"
          stroke="white"
          strokeWidth="1"
          opacity="0.3"
        />
        
        {/* Letter D */}
        <path
          d="M25 25 L25 75 L45 75 Q60 75 60 50 Q60 25 45 25 Z M35 35 L42 35 Q50 35 50 50 Q50 65 42 65 L35 65 Z"
          fill="url(#textGradient)"
          className="font-bold"
        />
        
        {/* Decorative elements - small circles representing DeFi nodes */}
        <circle cx="70" cy="30" r="3" fill="white" opacity="0.8" />
        <circle cx="75" cy="45" r="2" fill="white" opacity="0.6" />
        <circle cx="72" cy="60" r="2.5" fill="white" opacity="0.7" />
        
        {/* Connection lines representing blockchain/network */}
        <path
          d="M67 32 L72 42 L70 57"
          stroke="white"
          strokeWidth="1"
          opacity="0.4"
          fill="none"
        />
      </svg>
    </MotionWrapper>
  );
};

export default LogoDeFiMx;