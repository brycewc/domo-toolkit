import { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Description,
  Label,
  Link,
  ListBox,
  Select
} from '@heroui/react';
import {
  IconApi,
  IconArrowRight,
  IconBolt,
  IconBrandGithub,
  IconChevronDown,
  IconClipboard,
  IconCookie,
  IconCookieOff,
  IconExternalLink,
  IconFileDescription,
  IconLayoutSidebarRightExpand,
  IconSearch,
  IconUserPlus
} from '@tabler/icons-react';
import { motion } from 'motion/react';
import toolkitLogo from '@/assets/toolkit-128.png';

const STORAGE_KEY = 'welcomePageDismissed';

const cookieOptions = [
  {
    id: 'auto',
    label: 'Auto (Default)',
    description: 'Clear cookies on 431 errors, preserve last 2 instances'
  },
  {
    id: 'preserve',
    label: 'Preserve',
    description: 'Preserve last 2 instances (only manual, no auto-clearing)'
  },
  {
    id: 'all',
    label: 'All',
    description: 'Clear all Domo cookies (only manual, no auto-clearing)'
  }
];

export function WelcomePage() {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [cookieSetting, setCookieSetting] = useState('auto');

  // Load cookie setting on mount
  useEffect(() => {
    chrome.storage.sync.get(['defaultClearCookiesHandling'], (result) => {
      if (result.defaultClearCookiesHandling) {
        setCookieSetting(result.defaultClearCookiesHandling);
      }
    });
  }, []);

  const handleCookieSettingChange = (value) => {
    setCookieSetting(value);
    chrome.storage.sync.set({ defaultClearCookiesHandling: value });
  };

  const handleGetStarted = () => {
    if (dontShowAgain) {
      chrome.storage.local.set({ [STORAGE_KEY]: true });
    }
    window.open(
      '/src/options/index.html#favicon',
      '_self',
      'noopener,noreferrer'
    );
  };

  const actionFeatures = [
    { icon: IconClipboard, label: 'Copy IDs instantly' },
    { icon: IconUserPlus, label: 'Share objects with yourself' },
    { icon: IconSearch, label: 'Analyze dependencies and relationships' },
    {
      icon: IconFileDescription,
      label: 'Instantly view the activity log for any object'
    }
  ];

  const automaticFeatures = [
    {
      icon: IconClipboard,
      label:
        'Tab titles are set automatically (gone are the days of hundreds of tabs named "Domo")'
    },
    {
      icon: IconUserPlus,
      label: 'Favicons automatically set to the instance logo (customizable)'
    },
    {
      icon: IconBolt,
      label:
        'Context is dynamic, so you only see what you need when you need it'
    },
    {
      icon: IconCookieOff,
      label:
        'Cookies clear automatically on 431 errors, preserving the last 2 instances'
    }
  ];

  const quickStartGuide = [
    'Navigate to any page in Domo',
    <span>
      Click the extension icon to use the popup (then click{' '}
      <IconLayoutSidebarRightExpand
        stroke={1.5}
        size={18}
        className='inline-block shrink-0 align-middle'
      />{' '}
      to use the side panel instead if preferred)
    </span>,
    'Use the buttons to copy, share, audit, delete, and more',
    'Try viewing different objects and observe the various available action buttons'
  ];

  const links = [
    {
      label: 'Documentation',
      url: 'https://github.com/brycewc/domo-toolkit#readme',
      icon: IconExternalLink
    },
    {
      label: 'Report an Issue',
      url: 'https://github.com/brycewc/domo-toolkit/issues',
      icon: IconBrandGithub
    },
    {
      label: 'Postman Collection',
      url: 'https://www.postman.com/brycewc/workspace/domo-product-apis',
      icon: IconApi
    }
  ];

  const selectedCookieOption = cookieOptions.find(
    (opt) => opt.id === cookieSetting
  );

  return (
    <div className='flex h-full min-h-[calc(100vh-20)] w-full flex-col justify-between space-y-4 pt-4'>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className='flex flex-col items-center justify-center gap-4 text-center'
      >
        <img src={toolkitLogo} alt='Domo Toolkit Logo' className='h-16 w-16' />
        <h1 className='text-xl font-semibold text-foreground'>
          Welcome to Domo Toolkit
        </h1>
        <p className='text-sm'>
          All the tools you need for working faster in Domo
        </p>
      </motion.div>

      {/* Action Features */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className='space-y-2'
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          What you can do
        </p>
        <div className='grid grid-cols-2 gap-2'>
          {actionFeatures.map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.15 + index * 0.05 }}
            >
              <Card>
                <Card.Header>
                  <Card.Description className='flex flex-row items-center justify-start gap-2 text-foreground'>
                    <feature.icon
                      stroke={1.5}
                      size={18}
                      className='shrink-0 text-accent'
                    />
                    {feature.label}
                  </Card.Description>
                </Card.Header>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Automatic Features */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className='space-y-2'
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          What happens automatically
        </p>
        <div className='grid grid-cols-2 gap-2'>
          {automaticFeatures.map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.15 + index * 0.05 }}
            >
              <Card>
                <Card.Header>
                  <Card.Description className='flex flex-row items-center justify-start gap-2 text-foreground'>
                    <feature.icon
                      stroke={1.5}
                      size={18}
                      className='shrink-0 text-accent'
                    />
                    {feature.label}
                  </Card.Description>
                </Card.Header>
              </Card>
            </motion.div>
          ))}
        </div>
        <Card>
          <Card.Header>
            <Card.Title className='flex items-center gap-2'>
              <IconCookie stroke={1.5} size={18} className='text-warning' />
              Cookie Management
            </Card.Title>
            <Card.Description>
              If you'd prefer to manage cookies manually, you can select
              'Preserve' or 'All' here
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <Select
              value={cookieSetting}
              onChange={handleCookieSettingChange}
              aria-label='Cookie clearing behavior'
              variant='secondary'
              fullWidth
            >
              <Select.Trigger>
                <Select.Value>
                  {selectedCookieOption?.label || 'Select...'}
                </Select.Value>
                <Select.Indicator>
                  <IconChevronDown stroke={1.5} />
                </Select.Indicator>
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {cookieOptions.map((option, index) => (
                    <ListBox.Item
                      key={option.id}
                      id={option.id}
                      textValue={option.label}
                    >
                      <div className='flex flex-col'>
                        <Label>{option.label}</Label>
                        <Description>{option.description}</Description>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </Card.Content>
        </Card>
      </motion.div>

      {/* Getting Started */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className='space-y-2'
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          Quick Start Guide
        </p>
        <Card>
          <Card.Content>
            <ol className='space-y-2 text-sm'>
              {quickStartGuide.map((step, index) => (
                <li className='flex items-center gap-2'>
                  <Chip
                    variant='soft'
                    color='accent'
                    className='size-6 items-center justify-center rounded-full'
                  >
                    {index + 1}
                  </Chip>
                  {step}
                </li>
              ))}
            </ol>
          </Card.Content>
        </Card>
      </motion.div>

      {/* Links */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        className='flex flex-col gap-2'
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          Helpful Links
        </p>
        <div className='flex flex-row flex-wrap gap-2'>
          {links.map((link) => (
            <Link
              href={link.url}
              target='_blank'
              key={link.label}
              className='button button--tertiary flex gap-2'
            >
              <link.icon stroke={1.5} />
              {link.label}
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className='mt-auto space-y-3'
      >
        <label className='flex cursor-pointer items-center justify-start gap-2'>
          <Checkbox isSelected={dontShowAgain} onChange={setDontShowAgain}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label className='text-xs'>Don't show this again</Label>
            </Checkbox.Content>
          </Checkbox>
        </label>

        <Button fullWidth variant='primary' onPress={handleGetStarted}>
          Get Started
          <IconArrowRight />
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
