import { Button, Card, Chip, Link } from '@heroui/react';
import { IconExternalLink, IconX } from '@tabler/icons-react';
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
    <div className='flex h-screen w-full max-w-4xl flex-col justify-between gap-4 px-4 pt-8 pb-4'>
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
          <div className='flex flex-wrap gap-4'>
            {releases.slice(1).map((release) => (
              <Link
                className='no-underline'
                href={release.githubUrl}
                key={release.version}
                target='_blank'
              >
                <Chip
                  className='w-20 justify-center'
                  color='accent'
                  key={release.version}
                  size='lg'
                  variant='soft'
                >
                  <Chip.Label>v{release.version}</Chip.Label>
                </Chip>
              </Link>
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
