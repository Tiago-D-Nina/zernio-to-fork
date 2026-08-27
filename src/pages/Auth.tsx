import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  User,
} from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import viaLogo from '@/assets/logo-via.png';
import viaLogoWhite from '@/assets/logo-via-white.png';
import './Auth.css';

const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string().min(6, 'Senha deve ter pelo menos 6 caracteres');
const nameSchema = z.string().min(2, 'Nome deve ter pelo menos 2 caracteres');

const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; fullName?: string }>({});

  const { signIn, signUp, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const validateForm = (): boolean => {
    const newErrors: { email?: string; password?: string; fullName?: string } = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (!isLogin) {
      const nameResult = nameSchema.safeParse(fullName);
      if (!nameResult.success) {
        newErrors.fullName = nameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Email ou senha incorretos');
          } else if (error.message.includes('Email not confirmed')) {
            toast.error('Confirme seu email antes de fazer login');
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('Login realizado com sucesso');
        navigate('/dashboard', { replace: true });
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('User already registered')) {
            toast.error('Este email já está cadastrado. Tente fazer login.');
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('Conta criada. Seu workspace está pronto.');
        navigate('/dashboard', { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setIsLogin((current) => !current);
    setErrors({});
    setShowPassword(false);
  };

  if (loading) {
    return (
      <div className="auth-loading" role="status" aria-label="Carregando acesso">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <span>Carregando acesso</span>
      </div>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-story via-mesh-navy via-noise" data-on-dark aria-label="Sobre a Nina">
        <img src={viaLogoWhite} alt="Viver de IA" className="auth-story-logo" />

        <div className="auth-story-copy">
          <p className="via-eyebrow auth-story-eyebrow">Nina · SDR com IA</p>
          <h1>
            Conversa qualificada.
            <br />
            <em>Pipeline em movimento.</em>
          </h1>
          <p className="auth-story-lede">
            Qualifique leads, agende reuniões e acompanhe cada oportunidade em um só lugar.
          </p>

          <ul className="auth-proof" aria-label="Recursos principais">
            <li>
              <MessageCircle aria-hidden="true" />
              <span>WhatsApp integrado</span>
            </li>
            <li>
              <CalendarCheck2 aria-hidden="true" />
              <span>Agendamento integrado</span>
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>Respostas com base no seu negócio</span>
            </li>
          </ul>
        </div>

        <p className="auth-story-footer">Viver de IA · engenharia aplicada a vendas.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-panel-brand">
            <img src={viaLogo} alt="Viver de IA" />
            <span className="via-pill">Nina</span>
          </div>

          <div className="auth-card">
            <header className="auth-card-header">
              <p className="via-eyebrow">{isLogin ? 'Acesso ao workspace' : 'Primeiro acesso'}</p>
              <h2>{isLogin ? 'Bem-vindo de volta.' : 'Crie seu workspace.'}</h2>
              <p>
                {isLogin
                  ? 'Entre para acompanhar conversas, oportunidades e reuniões.'
                  : 'Use seu email de trabalho para configurar a Nina.'}
              </p>
            </header>

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              {!isLogin && (
                <div className="auth-field">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <div className="auth-input-wrap">
                    <User aria-hidden="true" />
                    <Input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="Seu nome"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                    />
                  </div>
                  {errors.fullName && (
                    <p id="fullName-error" className="auth-error" role="alert">
                      {errors.fullName}
                    </p>
                  )}
                </div>
              )}

              <div className="auth-field">
                <Label htmlFor="email">Email</Label>
                <div className="auth-input-wrap">
                  <Mail aria-hidden="true" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="voce@empresa.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                  />
                </div>
                {errors.email && (
                  <p id="email-error" className="auth-error" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="auth-field">
                <Label htmlFor="password">Senha</Label>
                <div className="auth-input-wrap auth-input-password">
                  <Lock aria-hidden="true" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="auth-error" role="alert">
                    {errors.password}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="auth-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    <span>{isLogin ? 'Entrar no workspace' : 'Criar workspace'}</span>
                    <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <div className="auth-switch">
              <span>{isLogin ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}</span>
              <button type="button" onClick={toggleMode}>
                {isLogin ? 'Criar conta' : 'Fazer login'}
              </button>
            </div>
          </div>

          <p className="auth-legal">
            Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.
          </p>
        </div>
      </section>
    </main>
  );
};

export default Auth;
