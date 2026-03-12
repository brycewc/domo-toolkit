import { Button, Card, Chip } from '@heroui/react';
import { IconExternalLink, IconSparkles, IconX } from '@tabler/icons-react';
import { motion } from 'motion/react';
import { useEffect } from 'react';

import { releases } from '@/data';

export function ReleaseNotesPage() {
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'RELEASE_NOTES_SEEN' }).catch(() => {});
  }, []);

  const latest = releases[0];

  const handleNavigate = () => {
    window.open(latest.githubUrl);
    handleClose();
  };

  const handleClose = () => {
    window.close();
  };

  if (!latest) {
    return (
      <div className='flex h-full items-center justify-center'>
        <p className='text-sm text-muted'>No release notes available.</p>
      </div>
    );
  }

  return (
    <div className='flex h-full min-h-[calc(100vh-20)] w-full flex-col justify-between space-y-4'>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className='flex flex-col items-center justify-center gap-4 text-center'
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <img
          alt='Domo Toolkit Logo'
          className='h-16 w-16'
          src='/toolkit-128.png'
        />
        <h1 className='text-xl font-semibold text-foreground'>
          What's New in v{latest.version}
        </h1>
        <p className='text-sm text-muted'>{latest.summary}</p>
      </motion.div>

      <motion.div
        animate={{ opacity: 1 }}
        className='space-y-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          Highlights
        </p>
        <div className='grid grid-cols-1 gap-2'>
          {latest.highlights.map((highlight, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 10 }}
              key={highlight}
              transition={{ delay: 0.15 + index * 0.05, duration: 0.2 }}
            >
              <Card>
                <Card.Header>
                  <Card.Description className='flex flex-row items-center justify-start gap-2 text-foreground'>
                    <Chip
                      className='size-6 shrink-0 items-center justify-center rounded-full'
                      color='accent'
                      variant='soft'
                    >
                      {index + 1}
                    </Chip>
                    {highlight}
                  </Card.Description>
                </Card.Header>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {releases.length > 1 && (
        <motion.div
          animate={{ opacity: 1 }}
          className='space-y-2'
          initial={{ opacity: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <p className='text-sm font-medium tracking-wide uppercase'>
            Previous Releases
          </p>
          <div className='flex flex-col gap-2'>
            {releases.slice(1).map((release) => (
              <Card key={release.version}>
                <Card.Header>
                  <Card.Title className='flex items-center gap-2'>
                    <IconSparkles
                      className='shrink-0 text-accent'
                      size={16}
                      stroke={1.5}
                    />
                    v{release.version}
                    <span className='text-xs font-normal text-muted'>
                      {release.date}
                    </span>
                  </Card.Title>
                  <Card.Description>{release.summary}</Card.Description>
                </Card.Header>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        animate={{ opacity: 1 }}
        className='mt-auto pb-4'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <div className='flex gap-2'>
          <Button fullWidth variant='secondary' onPress={handleNavigate}>
            <IconExternalLink stroke={1.5} />
            View Full Release Notes
          </Button>
          <Button fullWidth variant='primary' onPress={handleClose}>
            <IconX stroke={1.5} />
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
