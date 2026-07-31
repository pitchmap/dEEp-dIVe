import './styles.css';
import { Game } from './core/Game';

const container = document.getElementById('app');
if (!container) {
  throw new Error('[main] #app 컨테이너를 찾을 수 없습니다 (index.html 확인).');
}

try {
  const game = new Game(container);
  game.start();
} catch (error) {
  console.error('[main] 초기화 실패:', error);
  const message = document.createElement('pre');
  message.className = 'fatal-error';
  message.textContent = `초기화 실패\n${error instanceof Error ? error.message : String(error)}`;
  container.appendChild(message);
  throw error;
}
