import { useState, useEffect } from 'react';
import { Alert, CloseButton } from '@heroui/react';

export function StatusBar({
  title,
  description = '',
  status = 'accent',
  timeout = 3000,
  onClose
}) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!timeout) return;
    const interval = 50; // Update every 50ms
    const decrement = (100 / timeout) * interval;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev - decrement;
        if (newProgress <= 0) {
          console.log('[StatusBar] Timeout completed, hiding status bar');
          clearInterval(timer);
          setIsVisible(false);
          return 0;
        }
        return newProgress;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [timeout]);

  // Separate effect to handle onClose callback
  useEffect(() => {
    if (!isVisible) {
      console.log('[StatusBar] isVisible is false, calling onClose');
      onClose?.();
    }
  }, [isVisible, onClose]);

  const handleClose = () => {
    console.log('[StatusBar] handleClose called');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  // Parse description to convert **text** to bold
  const parseDescription = (text) => {
    if (!text) return text;

    const parts = [];
    let lastIndex = 0;
    const regex = /\*\*(.+?)\*\*/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      // Add bold text
      parts.push(<strong key={match.index}>{match[1]}</strong>);
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  // Map status to background color classes (needed for Tailwind purging)
  const bgColorMap = {
    accent: 'bg-accent',
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger'
  };

  const bgColor = bgColorMap[status] || 'bg-accent';

  return (
    <Alert
      status={status}
      className={`h-fit min-h-[6rem] w-full overflow-hidden bg-linear-to-r to-${status}/10`}
    >
      {timeout ? (
        <div
          id='status-bar-timeout-indicator'
          className={`absolute top-[1px] left-[0px] h-[3px] opacity-75 transition-all duration-50 ${bgColor}`}
          style={{ width: `calc(${progress}% - 2rem)` }}
        />
      ) : null}
      {/* <Alert.Indicator className={timeout ? 'mt-[3px]' : ''} /> */}
      <Alert.Content className={timeout ? 'pt-[3px]' : ''}>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{parseDescription(description)}</Alert.Description>
      </Alert.Content>
      {!timeout ? (
        <CloseButton
          className={timeout ? 'mt-[3px] rounded-full' : 'rounded-full'}
          onPress={handleClose}
        />
      ) : null}
    </Alert>
  );
}
