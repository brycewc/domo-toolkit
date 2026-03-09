import {
  Button,
  Card,
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
  IconBrowser,
  IconChevronDown,
  IconClipboard,
  IconCookie,
  IconCookieOff,
  IconEye,
  IconFavicon,
  IconFileDescription,
  IconFileTypeDoc,
  IconLayoutSidebarRightExpand,
  IconUserPlus
} from '@tabler/icons-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

const cookieOptions = [
  {
    description: 'Clear cookies on 431 errors, preserve last 2 instances',
    id: 'auto',
    label: 'Auto (Default)'
  },
  {
    description: 'Preserve last 2 instances (only manual, no auto-clearing)',
    id: 'preserve',
    label: 'Preserve'
  },
  {
    description: 'Clear all Domo cookies (only manual, no auto-clearing)',
    id: 'all',
    label: 'All'
  }
];

export function WelcomePage() {
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
    window.location.hash = 'favicon';
  };

  const actionFeatures = [
    { icon: IconClipboard, label: 'Copy IDs instantly' },
    { icon: IconUserPlus, label: 'Share objects with yourself' },
    { icon: IconEye, label: 'Analyze dependencies and relationships' },
    {
      icon: IconFileDescription,
      label: 'Instantly view the activity log for any object'
    }
  ];

  const automaticFeatures = [
    {
      icon: IconBrowser,
      label:
        'Tab titles are set automatically (gone are the days of hundreds of tabs named "Domo")'
    },
    {
      icon: IconFavicon,
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
        className='inline-block shrink-0 align-middle'
        size={18}
        stroke={1.5}
      />{' '}
      to use the side panel instead if preferred)
    </span>,
    'Use the buttons to copy, share, audit, delete, and more',
    'Try viewing different objects and observe the various available action buttons'
  ];

  const links = [
    {
      icon: IconFileTypeDoc,
      label: 'Documentation',
      url: 'https://github.com/brycewc/domo-toolkit#readme'
    },
    {
      icon: IconBrandGithub,
      label: 'Report an Issue',
      url: 'https://github.com/brycewc/domo-toolkit/issues'
    },
    {
      icon: IconApi,
      label: 'Postman Collection',
      url: 'https://www.postman.com/brycewc/workspace/domo-product-apis'
    }
  ];

  const selectedCookieOption = cookieOptions.find(
    (opt) => opt.id === cookieSetting
  );

  return (
    <div className='flex h-full min-h-[calc(100vh-20)] w-full flex-col justify-between space-y-4'>
      {/* Header */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className='flex flex-col items-center justify-center gap-4 text-center'
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <img
          alt='Domo Toolkit Logo'
          className='h-16 w-16'
          src='/public/toolkit-128.png'
        />
        <h1 className='text-xl font-semibold text-foreground'>
          Welcome to Domo Toolkit
        </h1>
        <p className='text-sm'>
          All the tools you need for working faster in Domo
        </p>
      </motion.div>

      {/* Action Features */}
      <motion.div
        animate={{ opacity: 1 }}
        className='space-y-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          What you can do
        </p>
        <div className='grid grid-cols-2 gap-2'>
          {actionFeatures.map((feature, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 10 }}
              key={feature.label}
              transition={{ delay: 0.15 + index * 0.05, duration: 0.2 }}
            >
              <Card>
                <Card.Header>
                  <Card.Description className='flex flex-row items-center justify-start gap-2 text-foreground'>
                    <feature.icon
                      className='shrink-0 text-accent'
                      size={18}
                      stroke={1.5}
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
        animate={{ opacity: 1 }}
        className='space-y-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          What happens automatically
        </p>
        <div className='grid grid-cols-2 gap-2'>
          {automaticFeatures.map((feature, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 10 }}
              key={feature.label}
              transition={{ delay: 0.15 + index * 0.05, duration: 0.2 }}
            >
              <Card>
                <Card.Header>
                  <Card.Description className='flex flex-row items-center justify-start gap-2 text-foreground'>
                    <feature.icon
                      className='shrink-0 text-accent'
                      size={18}
                      stroke={1.5}
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
              <IconCookie className='text-warning' size={18} stroke={1.5} />
              Cookie Management
            </Card.Title>
            <Card.Description>
              If you'd prefer to manage cookies manually, you can select
              'Preserve' or 'All' here
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <Select
              fullWidth
              aria-label='Cookie clearing behavior'
              value={cookieSetting}
              variant='secondary'
              onChange={handleCookieSettingChange}
            >
              <Select.Trigger>
                <Select.Value>
                  {selectedCookieOption?.label || 'Select...'}
                </Select.Value>
                <Select.Indicator>
                  <IconChevronDown stroke={1} />
                </Select.Indicator>
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {cookieOptions.map((option, _index) => (
                    <ListBox.Item
                      id={option.id}
                      key={option.id}
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
        animate={{ opacity: 1 }}
        className='space-y-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
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
                    className='size-6 items-center justify-center rounded-full'
                    color='accent'
                    variant='soft'
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
        animate={{ opacity: 1 }}
        className='flex flex-col gap-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          Helpful Links
        </p>
        <div className='flex flex-row flex-wrap gap-2'>
          {links.map((link) => (
            <Link
              className='no-underline'
              href={link.url}
              key={link.label}
              target='_blank'
            >
              <Button variant='tertiary'>
                <link.icon stroke={1.5} />
                {link.label}
              </Button>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        animate={{ opacity: 1 }}
        className='mt-auto pb-4'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <Button fullWidth variant='primary' onPress={handleGetStarted}>
          Get Started
          <IconArrowRight />
        </Button>
      </motion.div>
    </div>
  );
}
