import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

const COLORS = {
  success: { bg: '#16a34a', icon: CheckCircle },
  error:   { bg: '#ef4444', icon: AlertTriangle },
  info:    { bg: '#00d4ff', icon: Info, textColor: '#04091a' },
};

export default function Toast({ message, type = 'success', duration = 3000, onClose }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible || !message) return null;

  const config = COLORS[type] || COLORS.success;
  const Icon = config.icon;

  return (
    <div style={{
      position: 'fixed', bottom: '80px', left: '50%',
      transform: 'translateX(-50%)', zIndex: 1000,
      backgroundColor: config.bg, color: config.textColor || '#ffffff',
      padding: '12px 20px', borderRadius: '10px',
      display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '13px', fontWeight: '600',
      animation: 'slideUp 0.3s ease',
      maxWidth: '340px', width: '90%',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <Icon size={16} strokeWidth={2} />
      {message}
    </div>
  );
}
