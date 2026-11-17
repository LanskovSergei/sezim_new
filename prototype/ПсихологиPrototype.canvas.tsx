import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  User, 
  Users, 
  Heart, 
  Brain, 
  Briefcase, 
  Calendar, 
  Clock, 
  Globe, 
  Smartphone, 
  MessageCircle, 
  ShieldCheck, 
  CreditCard,
  Bitcoin,
  Star,
  Video
} from 'lucide-react';

export default function ПсихологиPrototype() {
  const [step, setStep] = useState('landing');
  const [formData, setFormData] = useState({});
  const [phone, setPhone] = useState('');

  // Helper to go to next step
  const go = (nextStep) => setStep(nextStep);

  // --- SCREENS ---

  const renderLanding = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <Heart size={40} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">психологи</h1>
        <p className="text-slate-600 mb-8 text-lg">
          Ваш личный центр психологической поддержки. Найдите своего специалиста за 2 минуты.
        </p>
        <button 
          onClick={() => go('quiz_1')}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
        >
          Подобрать психолога <ChevronRight size={20} />
        </button>
        <button 
          onClick={() => go('auth_phone')}
          className="w-full mt-4 bg-white text-blue-600 border border-blue-200 py-4 rounded-xl font-semibold text-lg hover:bg-blue-50 transition"
        >
          Уже есть аккаунт (Войти)
        </button>
      </div>
    </div>
  );

  const renderQuiz1 = () => (
    <div className="flex flex-col h-full bg-white p-6">
      <div className="flex items-center mb-8">
        <button onClick={() => go('landing')} className="text-slate-400 hover:text-slate-900"><ChevronLeft size={24} /></button>
        <div className="flex-1 flex justify-center gap-1 px-4">
          <div className="h-1.5 w-1/4 bg-blue-600 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-slate-100 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-slate-100 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-slate-100 rounded-full"></div>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Для кого ищем специалиста?</h2>
      <div className="space-y-3">
        {[
          { id: 'individual', icon: User, title: 'Только для меня', desc: 'Индивидуальная терапия' },
          { id: 'couple', icon: Users, title: 'Для пары', desc: 'Решение семейных конфликтов' },
          { id: 'teen', icon: Brain, title: 'Для ребенка', desc: 'Детский психолог' },
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => { setFormData({...formData, format: item.id}); go('quiz_2'); }}
            className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-blue-600 hover:bg-blue-50 transition flex items-center gap-4"
          >
            <div className="bg-slate-100 p-3 rounded-lg text-slate-600"><item.icon size={24} /></div>
            <div>
              <div className="font-semibold text-slate-900">{item.title}</div>
              <div className="text-sm text-slate-500">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderQuiz2 = () => (
    <div className="flex flex-col h-full bg-white p-6">
      <div className="flex items-center mb-8">
        <button onClick={() => go('quiz_1')} className="text-slate-400 hover:text-slate-900"><ChevronLeft size={24} /></button>
        <div className="flex-1 flex justify-center gap-1 px-4">
          <div className="h-1.5 w-1/4 bg-blue-600 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-blue-600 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-slate-100 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-slate-100 rounded-full"></div>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Что вас сейчас беспокоит?</h2>
      <p className="text-slate-500 mb-6">Выберите 1-3 темы (можно пропустить)</p>
      <div className="flex flex-wrap gap-2 mb-8">
        {['Тревога и страхи', 'Апатия и выгорание', 'Отношения', 'Самооценка', 'Карьера', 'Кризис / Переезд', 'Просто что-то не так'].map(topic => (
          <button key={topic} className="px-4 py-2 border border-slate-200 rounded-full text-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition">
            {topic}
          </button>
        ))}
      </div>
      <button onClick={() => go('quiz_3')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition mt-auto">
        Продолжить
      </button>
    </div>
  );

  const renderQuiz3 = () => (
    <div className="flex flex-col h-full bg-white p-6">
      <div className="flex items-center mb-8">
        <button onClick={() => go('quiz_2')} className="text-slate-400 hover:text-slate-900"><ChevronLeft size={24} /></button>
        <div className="flex-1 flex justify-center gap-1 px-4">
          <div className="h-1.5 w-1/4 bg-blue-600 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-blue-600 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-blue-600 rounded-full"></div>
          <div className="h-1.5 w-1/4 bg-slate-100 rounded-full"></div>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Организационные моменты</h2>
      
      <div className="space-y-6 mb-8">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Язык консультации</label>
          <div className="flex gap-2">
            <button className="flex-1 py-2 bg-blue-50 border border-blue-600 text-blue-700 rounded-lg font-medium">Русский</button>
            <button className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium">Қазақша</button>
            <button className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium">Türkçe</button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Удобное время</label>
          <div className="grid grid-cols-2 gap-2">
            <button className="py-2 border border-slate-200 text-slate-600 rounded-lg font-medium flex items-center justify-center gap-2"><Clock size={16}/> Утро</button>
            <button className="py-2 bg-blue-50 border border-blue-600 text-blue-700 rounded-lg font-medium flex items-center justify-center gap-2"><Clock size={16}/> Вечер</button>
          </div>
        </div>
      </div>

      <button onClick={() => go('auth_phone')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition mt-auto">
        Подобрать специалистов
      </button>
    </div>
  );

  const renderAuthPhone = () => (
    <div className="flex flex-col h-full bg-white p-6">
      <div className="flex items-center mb-8">
        <button onClick={() => go('landing')} className="text-slate-400 hover:text-slate-900"><ChevronLeft size={24} /></button>
      </div>
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Мы нашли 4 специалистов!</h2>
        <p className="text-slate-500">Введите номер телефона, чтобы сохранить результаты в Личном кабинете</p>
      </div>

      <div className="mb-6">
        <div className="flex border border-slate-300 rounded-xl overflow-hidden focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition">
          <div className="bg-slate-50 px-4 py-4 border-r border-slate-300 text-slate-600 font-medium flex items-center gap-2">
            🇷🇺 +7
          </div>
          <input 
            type="tel" 
            placeholder="900 123 45 67" 
            className="flex-1 px-4 py-4 outline-none text-lg"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <button onClick={() => go('auth_otp')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition mb-4">
        Получить код
      </button>

      <div className="relative flex items-center py-2 mb-4">
        <div className="flex-grow border-t border-slate-200"></div>
        <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">или быстрый вход</span>
        <div className="flex-grow border-t border-slate-200"></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="py-3 border border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50">
          <MessageCircle size={20} className="text-blue-500"/> Telegram
        </button>
        <button className="py-3 border border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50">
          <Smartphone size={20} className="text-green-500"/> WhatsApp
        </button>
      </div>
    </div>
  );

  const renderAuthOtp = () => (
    <div className="flex flex-col h-full bg-white p-6">
      <div className="flex items-center mb-8">
        <button onClick={() => go('auth_phone')} className="text-slate-400 hover:text-slate-900"><ChevronLeft size={24} /></button>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Введите код</h2>
      <p className="text-slate-500 mb-8">Мы отправили код в Telegram на номер +7 {phone || '900 123 45 67'}</p>
      
      <div className="flex justify-between gap-4 mb-8">
        {[1, 2, 3, 4].map(i => (
          <input key={i} type="text" maxLength="1" className="w-16 h-16 text-center text-2xl font-bold border border-slate-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" />
        ))}
      </div>

      <button onClick={() => go('dashboard')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition">
        Войти
      </button>
      <p className="text-center text-sm text-slate-400 mt-6">
        Отправить код повторно через 0:59
      </p>
    </div>
  );

  const renderDashboard = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white p-6 pb-4 rounded-b-3xl shadow-sm mb-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Личный кабинет</h2>
            <p className="text-sm text-slate-500">Баланс: 0 сессий</p>
          </div>
          <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
            <User size={20} />
          </div>
        </div>
        
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
          <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-semibold text-blue-900">Ваша подборка готова</h4>
            <p className="text-sm text-blue-700 mt-1">Основано на вашей анкете. Идеальное совпадение.</p>
          </div>
        </div>
      </div>

      <div className="px-6 flex-1 overflow-y-auto pb-6">
        <h3 className="font-bold text-slate-900 mb-4">Идеальный мэтч (Очередь 1)</h3>
        
        {/* Psychologist Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-4">
          <div className="flex gap-4 mb-4">
            <div className="w-16 h-16 bg-slate-200 rounded-xl bg-cover bg-center" style={{backgroundImage: 'url("https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80")'}}></div>
            <div>
              <h4 className="font-bold text-slate-900 text-lg">Анна Смирнова</h4>
              <p className="text-sm text-slate-500">КПТ, Гештальт • Опыт 8 лет</p>
              <div className="flex items-center gap-1 mt-1 text-amber-500 text-sm font-medium">
                <Star size={14} fill="currentColor" /> 5.0 (124 отзыва)
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md">Тревога</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md">Выгорание</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="font-bold text-slate-900">3 500 ₽ <span className="text-xs text-slate-400 font-normal">/ 50 мин</span></div>
            <button onClick={() => go('checkout')} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
              Выбрать время
            </button>
          </div>
        </div>

        <h3 className="font-bold text-slate-900 mb-4 mt-6">Компромисс по времени (Очередь 2)</h3>
        
        {/* Psychologist Card 2 */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 opacity-75">
          <div className="flex gap-4 mb-4">
            <div className="w-16 h-16 bg-slate-200 rounded-xl bg-cover bg-center" style={{backgroundImage: 'url("https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=150&q=80")'}}></div>
            <div>
              <h4 className="font-bold text-slate-900 text-lg">Елена Ким</h4>
              <p className="text-sm text-slate-500">Психоанализ • Опыт 12 лет</p>
            </div>
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg mb-4">
            Подходит под ваш запрос, но свободные окна только утром.
          </p>
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="font-bold text-slate-900">4 000 ₽</div>
            <button className="bg-slate-100 text-slate-700 px-5 py-2 rounded-lg font-medium">
              Посмотреть
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCheckout = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white p-6 border-b border-slate-200">
        <div className="flex items-center mb-4">
          <button onClick={() => go('dashboard')} className="text-slate-400 hover:text-slate-900"><ChevronLeft size={24} /></button>
          <h2 className="text-xl font-bold text-slate-900 ml-4">Оформление сессии</h2>
        </div>
        <div className="flex gap-4 items-center">
          <div className="w-12 h-12 bg-slate-200 rounded-full bg-cover bg-center" style={{backgroundImage: 'url("https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80")'}}></div>
          <div>
            <h4 className="font-bold text-slate-900">Анна Смирнова</h4>
            <p className="text-sm text-slate-500">14 ноября, 19:00 (МСК)</p>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1">
        <h3 className="font-bold text-slate-900 mb-4">Способ оплаты</h3>
        
        <div className="space-y-3 mb-8">
          <label className="flex items-center justify-between p-4 bg-white border-2 border-blue-600 rounded-xl cursor-pointer">
            <div className="flex items-center gap-3">
              <CreditCard className="text-blue-600" />
              <span className="font-medium text-slate-900">Банковская карта (РФ)</span>
            </div>
            <input type="radio" name="payment" defaultChecked className="w-5 h-5 text-blue-600" />
          </label>
          
          <label className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl cursor-pointer">
            <div className="flex items-center gap-3">
              <Globe className="text-slate-400" />
              <span className="font-medium text-slate-900">Карта СНГ (Kaspi, Payme)</span>
            </div>
            <input type="radio" name="payment" className="w-5 h-5 text-blue-600" />
          </label>

          <label className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl cursor-pointer">
            <div className="flex items-center gap-3">
              <Bitcoin className="text-slate-400" />
              <span className="font-medium text-slate-900">Криптовалюта (USDT)</span>
            </div>
            <input type="radio" name="payment" className="w-5 h-5 text-blue-600" />
          </label>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6">
          <div className="flex justify-between text-slate-600 mb-2">
            <span>Сессия 50 минут</span>
            <span>3 500 ₽</span>
          </div>
          <div className="flex justify-between text-slate-600 mb-4">
            <span>Скидка на первую сессию</span>
            <span className="text-green-600">-500 ₽</span>
          </div>
          <div className="flex justify-between font-bold text-lg text-slate-900 border-t border-slate-100 pt-4">
            <span>Итого к оплате</span>
            <span>3 000 ₽</span>
          </div>
        </div>

        <button onClick={() => go('success')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition">
          Оплатить 3 000 ₽
        </button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="flex flex-col h-full bg-blue-600 text-white p-6 text-center justify-center">
      <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <Check size={48} className="text-white" />
      </div>
      <h2 className="text-3xl font-bold mb-4">Сессия оплачена!</h2>
      <p className="text-blue-100 text-lg mb-8">
        Ждем вас 14 ноября в 19:00. Ссылка на видеозвонок появится в Личном кабинете.
      </p>
      
      <div className="bg-white/10 p-4 rounded-xl mb-8 text-left flex items-start gap-4">
        <Video className="shrink-0 mt-1" />
        <div>
          <h4 className="font-semibold">Настройте уведомления</h4>
          <p className="text-sm text-blue-100 mt-1">Куда вам прислать напоминание за час до сессии?</p>
          <div className="flex gap-2 mt-3">
            <button className="bg-white text-blue-900 px-4 py-2 rounded-lg text-sm font-medium">Telegram</button>
            <button className="bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium">WhatsApp</button>
          </div>
        </div>
      </div>

      <button onClick={() => go('dashboard')} className="w-full bg-white text-blue-600 py-4 rounded-xl font-semibold text-lg hover:bg-blue-50 transition mt-auto">
        Вернуться в Личный кабинет
      </button>
    </div>
  );

  return (
    <div className="w-full max-w-[400px] mx-auto h-[800px] max-h-screen bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-[8px] border-slate-900 relative flex flex-col font-sans">
      {/* Status Bar Mock */}
      <div className="h-7 w-full bg-transparent absolute top-0 z-50 flex justify-between items-center px-6 text-xs font-medium text-slate-800 mix-blend-difference">
        <span>9:41</span>
        <div className="flex gap-1.5 items-center">
          <div className="w-4 h-3 border border-current rounded-sm"></div>
          <div className="w-4 h-3 border border-current rounded-sm"></div>
          <div className="w-5 h-3 border border-current rounded-sm"></div>
        </div>
      </div>

      {/* Dynamic Content */}
      <div className="flex-1 overflow-hidden pt-7">
        {step === 'landing' && renderLanding()}
        {step === 'quiz_1' && renderQuiz1()}
        {step === 'quiz_2' && renderQuiz2()}
        {step === 'quiz_3' && renderQuiz3()}
        {step === 'auth_phone' && renderAuthPhone()}
        {step === 'auth_otp' && renderAuthOtp()}
        {step === 'dashboard' && renderDashboard()}
        {step === 'checkout' && renderCheckout()}
        {step === 'success' && renderSuccess()}
      </div>
      
      {/* Home Indicator Mock */}
      <div className="h-1 w-1/3 bg-slate-900 rounded-full absolute bottom-2 left-1/2 -translate-x-1/2 z-50"></div>
    </div>
  );
}