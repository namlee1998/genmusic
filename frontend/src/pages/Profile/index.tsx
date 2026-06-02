import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
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

const getFriendlyError = (err: unknown) => {
  let message = 'Không thể lưu thông tin hồ sơ';
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
    return form.full_name.trim() || profile?.email?.split('@')[0] || 'Tài khoản của tôi';
  }, [form.full_name, profile?.email]);

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
        if (mounted) setError(getFriendlyError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const updateField = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };

  const validate = () => {
    if (!form.age.trim()) return null;
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 0 || age > 150) {
      return 'Tuổi phải là số nguyên từ 0 đến 150.';
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
      setNotice('Đã lưu thông tin hồ sơ.');
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }));
    } catch (err: unknown) {
      setError(getFriendlyError(err));
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
      setNotice('Đã xóa thông tin hồ sơ mở rộng.');
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }));
    } catch (err: unknown) {
      setError(getFriendlyError(err));
    } finally {
      setResetting(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Avatar phải là file ảnh.');
      return;
    }

    try {
      setUploadingAvatar(true);
      setError(null);
      const nextProfile = await uploadProfileAvatar(file);
      setProfile(nextProfile);
      setForm(toForm(nextProfile));
      setNotice('Đã cập nhật ảnh đại diện.');
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }));
    } catch (err: unknown) {
      setError(getFriendlyError(err));
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
              Về trang chính
            </button>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <label
                className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full border border-outline-variant/30 bg-surface-container-high shadow-sm focus-within:ring-2 focus-within:ring-primary/40"
                title="Đổi ảnh đại diện"
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
                    {uploadingAvatar ? 'Đang tải...' : 'Đổi ảnh'}
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
                  {profile?.email || 'Thông tin tài khoản hiện tại'}
                </p>
                <p className="mt-2 truncate text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {form.job_title.trim() || 'Chưa cập nhật chức danh'}
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
                {resetting ? 'Đang xóa...' : 'Xóa hồ sơ'}
              </Button>
              <Button
                type="submit"
                form="profile-form"
                className="px-4 py-2 text-sm"
                disabled={loading || saving || resetting || uploadingAvatar}
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
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
              Thông tin cá nhân
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label="Họ và tên"
                value={form.full_name}
                onChange={(event) => updateField('full_name', event.target.value)}
                disabled={loading}
                placeholder="Nguyễn Văn A"
              />
              <Input
                label="Tuổi"
                type="number"
                min={0}
                max={150}
                value={form.age}
                onChange={(event) => updateField('age', event.target.value)}
                disabled={loading}
                placeholder="25"
              />
              <Input
                label="Chức danh"
                value={form.job_title}
                onChange={(event) => updateField('job_title', event.target.value)}
                disabled={loading}
                placeholder="QA Engineer"
              />
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-on-surface-variant">
              Liên hệ & giới thiệu
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label="Số điện thoại"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                disabled={loading}
                placeholder="0900000000"
              />
              <Input
                label="Địa chỉ"
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
                disabled={loading}
                placeholder="Thành phố Hồ Chí Minh"
              />
              <div className="md:col-span-2">
                <label
                  htmlFor="profile-bio"
                  className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Giới thiệu
                </label>
                <textarea
                  id="profile-bio"
                  value={form.bio}
                  onChange={(event) => updateField('bio', event.target.value)}
                  disabled={loading}
                  rows={5}
                  className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm transition-colors duration-200 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-500"
                  placeholder="Vai trò, kinh nghiệm hoặc ghi chú liên hệ..."
                />
              </div>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        danger
        title="Xóa thông tin hồ sơ?"
        description="Thao tác này chỉ xóa thông tin mở rộng và ảnh đại diện, không xóa tài khoản đăng nhập của bạn."
        confirmLabel={resetting ? 'Đang xóa...' : 'Xóa hồ sơ'}
        cancelLabel="Giữ lại"
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={() => {
          setShowResetConfirm(false);
          void handleReset();
        }}
      />
    </section>
  );
}
