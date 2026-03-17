import { motion } from "framer-motion";
import { QuickActionsGrid } from "@/components/admin/QuickActionsGrid";

const AdminDashboard = () => {

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Dashboard de Administración
        </h1>
        <p className="text-muted-foreground">
          Bienvenido de vuelta. Gestiona el contenido de DeFi México desde aquí.
        </p>
      </motion.div>

      {/* Quick Actions - Centrado */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex justify-center"
      >
        <div className="max-w-md w-full">
          <QuickActionsGrid />
        </div>
      </motion.div>
    </div>
  );
};

export default AdminDashboard;