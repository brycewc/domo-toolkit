import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

const STATUS_ICONS = {
  accent: IconInfoCircle,
  danger: IconAlertCircle,
  default: IconInfoCircle,
  success: IconCircleCheck,
  warning: IconAlertTriangle
};

const STATUS_CLASSES = [
  ['alert--accent', 'accent'],
  ['alert--danger', 'danger'],
  ['alert--success', 'success'],
  ['alert--warning', 'warning']
];

export function AlertStatusIcon(props) {
  const ref = useRef(null);
  const [status, setStatus] = useState('default');

  useEffect(() => {
    const el = ref.current?.closest('[data-slot="alert-root"]');
    if (!el) return;

    const detect = () => {
      for (const [cls, s] of STATUS_CLASSES) {
        if (el.classList.contains(cls)) {
          setStatus(s);
          return;
        }
      }
      setStatus('default');
    };

    detect();

    const observer = new MutationObserver(detect);
    observer.observe(el, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const Icon = STATUS_ICONS[status];

  return <Icon data-slot='alert-default-icon' ref={ref} {...props} />;
}
