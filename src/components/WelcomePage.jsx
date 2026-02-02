import { useState, useEffect } from 'react';
import { Button, Checkbox, Input } from '@heroui/react';
import {
  IconArrowRight,
  IconBrandGithub,
  IconClipboard,
  IconCookieOff,
  IconExternalLink,
  IconMail,
  IconSearch,
  IconShare
} from '@tabler/icons-react';
import { motion } from 'motion/react';
import toolkitLogo from '@/assets/toolkit.png';

const STORAGE_KEY = 'welcomePageDismissed';

export function WelcomePage({ onDismiss }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState(null); // null | 'loading' | 'success' | 'error'

  const handleGetStarted = () => {
    if (dontShowAgain) {
      chrome.storage.local.set({ [STORAGE_KEY]: true });
    }
    onDismiss();
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setEmailStatus('loading');

    // TODO: Replace with actual email signup endpoint
    // For now, simulate a successful signup
    try {
      // Placeholder for email signup API call
      await new Promise(resolve => setTimeout(resolve, 800));
      setEmailStatus('success');
      chrome.storage.local.set({ subscribedEmail: email });
    } catch (error) {
      setEmailStatus('error');
    }
  };

  const features = [
    { icon: IconClipboard, label: 'Copy IDs instantly' },
    { icon: IconShare, label: 'Share objects with yourself' },
    { icon: IconSearch, label: 'Find where things are used' },
    { icon: IconCookieOff, label: 'Clear cookies quickly' }
  ];

  const links = [
    { label: 'Documentation', url: 'https://github.com/brycewc/majordomo-toolkit#readme', icon: IconExternalLink },
    { label: 'Report an Issue', url: 'https://github.com/brycewc/majordomo-toolkit/issues', icon: IconBrandGithub }
  ];

  return (
    <div className="flex min-h-full flex-col bg-background p-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 text-center"
      >
        <img
          src={toolkitLogo}
          alt="Majordomo"
          className="mx-auto mb-4 h-16 w-16"
        />
        <h1 className="text-xl font-semibold text-foreground">
          Welcome to Majordomo
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your toolkit for working faster in Domo
        </p>
      </motion.div>

      {/* Features */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mb-6"
      >
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          What you can do
        </p>
        <div className="grid grid-cols-2 gap-2">
          {features.map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.15 + index * 0.05 }}
              className="flex items-center gap-2 rounded-lg bg-surface p-3"
            >
              <feature.icon size={18} className="shrink-0 text-accent" />
              <span className="text-xs text-foreground">{feature.label}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Getting Started */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mb-6 rounded-lg border border-border bg-surface/50 p-4"
      >
        <p className="mb-2 text-sm font-medium text-foreground">Getting Started</p>
        <ol className="space-y-2 text-xs text-muted">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">1</span>
            <span>Navigate to any page in Domo</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">2</span>
            <span>Click the extension icon or use the side panel</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">3</span>
            <span>Use the tools to copy, share, find, and more</span>
          </li>
        </ol>
      </motion.div>

      {/* Email Signup */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        className="mb-6"
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Stay Updated
        </p>
        {emailStatus === 'success' ? (
          <div className="rounded-lg bg-success/10 p-3 text-center">
            <p className="text-sm text-success">Thanks for subscribing!</p>
          </div>
        ) : (
          <form onSubmit={handleEmailSubmit} className="flex gap-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              size="sm"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              isLoading={emailStatus === 'loading'}
              isDisabled={!email || !email.includes('@')}
            >
              <IconMail size={16} />
            </Button>
          </form>
        )}
        <p className="mt-1 text-xs text-muted">
          Get notified about new features and updates
        </p>
      </motion.div>

      {/* Links */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="mb-6 flex flex-wrap gap-2"
      >
        {links.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface/80 hover:text-foreground"
          >
            <link.icon size={14} />
            {link.label}
          </a>
        ))}
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.35 }}
        className="mt-auto space-y-3"
      >
        <label className='flex cursor-pointer items-center justify-end gap-2'>
          <Checkbox
            isSelected={dontShowAgain}
            onChange={setDontShowAgain}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <span className='text-xs text-muted'>Don't show this again</span>
        </label>

        <Button
          fullWidth
          variant="primary"
          onPress={handleGetStarted}
          className="font-medium"
        >
          Get Started
          <IconArrowRight size={16} />
        </Button>
      </motion.div>
    </div>
  );
}

// Helper to check if welcome page should be shown
export async function shouldShowWelcomePage() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(!result[STORAGE_KEY]);
    });
  });
}

// Helper to reset welcome page (for testing/settings)
export function resetWelcomePage() {
  chrome.storage.local.remove([STORAGE_KEY]);
}
