/**
 * D1~D2 부트스트랩 장면은 D3 계획대로 회색 박스 장면(CanyonScene)으로
 * 교체되었다 (CURRENT_STATUS D2 그래픽스 구역 예고 사항).
 *
 * `core/Game.ts`(공통 보호 파일)가 이 모듈 이름을 직접 임포트하므로,
 * 렌더 소유 영역 안에서 별칭 재수출로 교체한다. Game.ts의 임포트를
 * CanyonScene으로 바꾸는 정리는 INTEGRATION_NOTES #002로 요청되어 있다 —
 * 리드 승인·반영 후 이 파일은 삭제한다.
 */

export { CanyonScene as BootstrapScene } from './CanyonScene';
