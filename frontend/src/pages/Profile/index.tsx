import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { useTranslation } from 'react-i18next';
import {
  createProfile,
  deleteProfile,
  getProfile,
  updateProfile,
  uploadProfileAvatar,
  type Profile,
  type ProfilePayload,
} from '@/services/api';

type ProfileForm = {
  full_name: string;
  age: string;
  job_title: string;
  address: string;
  phone: string;
  bio: string;
};

const emptyForm: ProfileForm = {
  full_name: '',
  age: '',
  job_title: '',
  address: '',
  phone: '',
  bio: '',
};

const toForm = (profile: Profile): ProfileForm => ({
  full_name: profile.full_name || '',
  age: profile.age === null || profile.age === undefined ? '' : String(profile.age),
  job_title: profile.job_title || '',
  address: profile.address || '',
  phone: profile.phone || '',
  bio: profile.bio || '',
});

const toPayload = (form: ProfileForm): ProfilePayload => ({
  full_name: form.full_name,
  age: form.age.trim() ? Number(form.age) : null,
  job_title: form.job_title,
  address: form.address,
  phone: form.phone,
  bio: form.bio,
});

const getFriendlyError = (err: unknown, fallback: string) => {
  let message = fallback;
  if (err instanceof Error) {
    message = err.message;
  }
  try {
    const axiosError = err as { response?: { data?: { message?: string } } };
    if (axiosError?.response?.data?.message) {
      message = axiosError.response.data.message;
    }
  } catch {
    // Ignore
  }
  return message;
};

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const displayName = useMemo(() => {
    return form.full_name.trim() || profile?.email?.split('@')[0] || t('profile.myProfile');
  }, [form.full_name, profile?.email, t]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const nextProfile = await getProfile();
        if (!mounted) return;
        setProfile(nextProfile);
        setForm(toForm(nextProfile));
      } catch (err: unknown) {
        if (mounted) setError(getFriendlyError(err, t('profile.saveFailed')));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [t]);

  const updateField = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };

  const validate = () => {
    if (!form.age.trim()) return null;
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 0 || age > 150) {
      return t('profile.ageValidation');
    }
    return null;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload = toPayload(form);
      const nextProfile = profile?.created_at
        ? await updateProfile(payload)
        : await createProfile(payload);
      setProfile(nextProfile);
      setForm(toForm(nextProfile));
      setNotice(t('profile.saved'));
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }));
    } catch (err: unknown) {
      setError(getFriendlyError(err, t('profile.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setResetting(true);
      setError(null);
      await deleteProfile();
      const nextProfile = await getProfile();
      setProfile(nextProfile);
      setForm(emptyForm);
      setNotice(t('profile.deleted'));
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }));
    } catch (err: unknown) {
      setError(getFriendlyError(err, t('profile.saveFailed')));
    } finally {
      setResetting(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('profile.avatarMustBeImage'));
      return;
    }

    try {
      setUploadingAvatar(true);
      setError(null);
      const nextProfile = await uploadProfileAvatar(file);
      setProfile(nextProfile);
      setForm(toForm(nextProfile));
      setNotice(t('profile.avatarUpdated'));
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }));
    } catch (err: unknown) {
      setError(getFriendlyError(err, t('profile.saveFailed')));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const avatarSrc = profile?.avatar_url || '';

  return (
    <section className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6">
        <div className="flex flex-col gap-4 border-b border-outline-variant/20 pb-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              {t('profile.backMain')}
            </button>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <label
                className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full border border-outline-variant/30 bg-surface-container-high shadow-sm focus-within:ring-2 focus-within:ring-primary/40"
                title={t('profile.changeAvatar')}
              >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="User avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary text-xl font-bold text-on-primary">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <span className="material-symbols-outlined text-[22px]">
                    {uploadingAvatar ? 'progress_activity' : 'photo_camera'}
                  </span>
                  <span className="mt-1 text-xs font-bold">
                    {uploadingAvatar ? t('profile.uploading') : t('profile.changeAvatarText')}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={loading || saving || resetting || uploadingAvatar}
                  aria-label="Upload avatar"
                  onChange={handleAvatarUpload}
                />
              </label>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold font-headline text-on-surface">
                  {displayName}
                </h1>
                <p className="mt-1 truncate text-sm text-on-surface-variant">
                  {profile?.email || t('profile.currentDetails')}
                </p>
                <p className="mt-2 truncate text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {form.job_title.trim() || t('profile.noJobTitle')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() => setShowResetConfirm(true)}
                disabled={loading || saving || resetting || uploadingAvatar}
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                {resetting ? t('profile.deleting') : t('profile.deleteBtn')}
              </Button>
              <Button
                type="submit"
                form="profile-form"
                className="px-4 py-2 text-sm"
                disabled={loading || saving || resetting || uploadingAvatar}
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {saving ? t('profile.saving') : t('profile.saveBtn')}
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        <form id="profile-form" onSubmit={handleSave} className="flex flex-col gap-6">
          <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-on-surface-variant">
              {t('profile.personalInfo')}
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t('profile.fullName')}
                value={form.full_name}
                onChange={(event) => updateField('full_name', event.target.value)}
                disabled={loading}
                placeholder={t('profile.fullNamePlaceholder')}
              />
              <Input
                label={t('profile.age')}
                type="number"
                min={0}
                max={150}
                value={form.age}
                onChange={(event) => updateField('age', event.target.value)}
                disabled={loading}
                placeholder="25"
              />
              <Input
                label={t('profile.jobTitle')}
                value={form.job_title}
                onChange={(event) => updateField('job_title', event.target.value)}
                disabled={loading}
                placeholder="QA Engineer"
              />
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-on-surface-variant">
              {t('profile.contactBio')}
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t('profile.phone')}
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                disabled={loading}
                placeholder="0900000000"
              />
              <Input
                label={t('profile.address')}
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
                disabled={loading}
                placeholder={t('profile.addressPlaceholder')}
              />
              <div className="md:col-span-2">
                <label
                  htmlFor="profile-bio"
                  className="mb-1.5 block text-sm font-medium text-on-surface"
                >
                  {t('profile.bio')}
                </label>
                <textarea
                  id="profile-bio"
                  value={form.bio}
                  onChange={(event) => updateField('bio', event.target.value)}
                  disabled={loading}
                  rows={5}
                  className="input-field w-full resize-none px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={t('profile.bioPlaceholder')}
                />
              </div>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        danger
        title={t('profile.confirmDeleteTitle')}
        description={t('profile.confirmDeleteDesc')}
        confirmLabel={resetting ? t('profile.deleting') : t('profile.deleteBtn')}
        cancelLabel={t('profile.keepBtn')}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={() => {
          setShowResetConfirm(false);
          void handleReset();
        }}
      />
    </section>
  );
}
