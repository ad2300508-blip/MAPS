import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

export default function ArrivedOverlay({ destName, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto"
      style={{ background: 'rgba(9,9,15,0.82)', backdropFilter: 'blur(14px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 30 }}
        animate={{ scale: 1,   opacity: 1, y: 0  }}
        exit={{   scale: 0.8,  opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-5 px-8 py-9 rounded-3xl text-center mx-6"
        style={{
          background: 'rgba(12,16,28,0.97)',
          border: '1.5px solid rgba(76,201,240,0.25)',
          boxShadow: '0 8px 60px rgba(0,0,0,0.7), 0 0 40px rgba(76,201,240,0.08)',
          maxWidth: 300,
        }}
      >
        {/* Animated checkmark */}
        <motion.div
          animate={{ scale: [1, 1.18, 1], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 0.7, delay: 0.2 }}
          style={{ color: '#4cc9f0' }}
        >
          <CheckCircle size={64} strokeWidth={1.5} />
        </motion.div>

        <div className="flex flex-col gap-1">
          <p className="text-2xl font-bold text-white tracking-tight">Sei arrivato!</p>
          {destName && (
            <p className="text-sm text-slate-400 leading-snug">{destName}</p>
          )}
        </div>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onDismiss}
          className="mt-1 px-7 py-3 rounded-2xl text-sm font-semibold focus:outline-none"
          style={{
            background: 'rgba(76,201,240,0.12)',
            border: '1.5px solid rgba(76,201,240,0.35)',
            color: '#4cc9f0',
          }}
        >
          Chiudi
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
