import { AlertIndicator } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import IconCheckCircle from '@icons/check-circle.svg?react';
import IconExclamationPointCircle from '@icons/exclamation-point-circle.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
const STATUS_ICONS = {
  accent: IconInfoCircle,
  danger: IconExclamationPointCircle,
  default: IconInfoCircle,
  success: IconCheckCircle,
  warning: IconExclamationTriangle
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

  return (
    <AlertIndicator className='p-0!'>
      <Icon data-slot='alert-default-icon' ref={ref} {...props} />
    </AlertIndicator>
  );
}
