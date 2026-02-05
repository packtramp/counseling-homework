import { useState, useRef } from 'react';
import { storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const MAX_SIZE = 400; // Max width/height in pixels
const MAX_FILE_SIZE = 200 * 1024; // Target ~200KB after resize

/**
 * Resize image to max dimensions and compress
 */
const resizeImage = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        if (width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw with white background (for transparent PNGs)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with quality adjustment
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create image blob'));
          }
        },
        'image/jpeg',
        0.85 // 85% quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Profile Photo Component
 *
 * Props:
 * - photoUrl: string - current photo URL
 * - counselorId: string - counselor's user ID
 * - counseleeId: string - counselee's document ID
 * - onPhotoUpdate: (url, field) => void - callback when photo is updated (field = 'photoUrl' or 'counseleePhotoUrl')
 * - editable: boolean - whether to show edit button
 * - size: 'small' | 'medium' | 'large' - photo size
 * - uploadedBy: 'counselor' | 'counselee' - who is uploading (determines storage path and field)
 */
export default function ProfilePhoto({
  photoUrl,
  counselorId,
  counseleeId,
  onPhotoUpdate,
  editable = false,
  size = 'medium',
  uploadedBy = 'counselor'
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const sizeClass = {
    small: 'profile-photo-sm',
    medium: 'profile-photo-md',
    large: 'profile-photo-lg'
  }[size];

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Resize image before upload
      const resizedBlob = await resizeImage(file);
      console.log(`Original: ${(file.size / 1024).toFixed(1)}KB → Resized: ${(resizedBlob.size / 1024).toFixed(1)}KB`);

      // Create storage reference - different paths depending on who uploads
      let storagePath;
      if (uploadedBy === 'counselor-self') {
        storagePath = `counselors/${counselorId}/profile.jpg`;
      } else {
        const fileName = uploadedBy === 'counselee' ? 'profile-counselee.jpg' : 'profile-counselor.jpg';
        storagePath = `counselees/${counselorId}/${counseleeId}/${fileName}`;
      }
      const storageRef = ref(storage, storagePath);

      // Upload resized file
      await uploadBytes(storageRef, resizedBlob);

      // Get download URL
      const downloadUrl = await getDownloadURL(storageRef);

      // Notify parent with the appropriate field name
      const fieldName = uploadedBy === 'counselee' ? 'counseleePhotoUrl' : 'photoUrl';
      if (onPhotoUpdate) {
        await onPhotoUpdate(downloadUrl, fieldName);
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      setError('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`profile-photo-container ${sizeClass}`}>
      <div className="profile-photo-wrapper">
        {photoUrl ? (
          <img src={photoUrl} alt="Profile" className="profile-photo" />
        ) : (
          <div className="profile-photo-placeholder">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
        )}
        {uploading && (
          <div className="profile-photo-loading">
            <span>...</span>
          </div>
        )}
      </div>
      {editable && (
        <>
          <button
            className="profile-photo-edit-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Change photo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </>
      )}
      {error && <div className="profile-photo-error">{error}</div>}
    </div>
  );
}
