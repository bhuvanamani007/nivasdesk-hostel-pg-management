import { useEffect, useState } from 'react';
import { User as UserIcon } from 'lucide-react';
import { api } from '../lib/api';

interface UserAvatarProps {
  avatarUrl?: string | null;
  name: string;
  sizeClass?: string;
  iconClass?: string;
  className?: string;
}

export function UserAvatar({
  avatarUrl,
  name,
  sizeClass = 'h-10 w-10',
  iconClass = 'h-5 w-5',
  className = '',
}: UserAvatarProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;
    setLoadFailed(false);

    if (!avatarUrl) {
      setResolvedUrl(null);
      return;
    }

    api
      .fetchProtectedImageUrl(avatarUrl)
      .then((blobUrl) => {
        if (!active) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        createdObjectUrl = blobUrl;
        setResolvedUrl(blobUrl);
      })
      .catch(() => {
        if (active) {
          setResolvedUrl(null);
          setLoadFailed(true);
        }
      });

    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [avatarUrl]);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50 text-teal-800 ${sizeClass} ${className}`}
    >
      {resolvedUrl && !loadFailed ? (
        <img
          src={resolvedUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setLoadFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <UserIcon className={iconClass} aria-hidden="true" />
      )}
    </span>
  );
}
