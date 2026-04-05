# Zideo — Video Cut Editor

Windows 기반 동영상 컷 편집 데스크탑 앱입니다.  
폴더에서 동영상을 선택하고, 시작/끝 지점을 지정한 후 구간만 별도 파일로 내보냅니다.

## 기능

- **좌측 Explorer**: 폴더 선택, 동영상 목록(썸네일/이름/날짜/길이), 이름·날짜·길이 정렬
- **중앙 Preview**: 비디오 플레이어, 타임라인 슬라이더, 시작·끝 지점 설정, 재생 컨트롤
- **우측 Config**: 출력 폴더, 파일명 패턴, 재인코딩 옵션

## 단축키

| 키 | 동작 |
|---|---|
| `Space` | 재생 / 일시정지 |
| `←` | 5초 뒤로 |
| `→` | 5초 앞으로 |
| `I` | 현재 위치를 시작 지점으로 설정 |
| `O` | 현재 위치를 끝 지점으로 설정 |

## 파일명 패턴 변수

| 변수 | 설명 |
|---|---|
| `{name}` | 원본 파일명 (확장자 제외) |
| `{start}` | 시작 시간 (HHmmss) |
| `{end}` | 끝 시간 (HHmmss) |

예: `{name}_cut_{start}` → `myvideo_cut_000130.mp4`

## 실행

```bash
npm install
npm run dev
```

## 요구사항

- Node.js 18+
- FFmpeg 바이너리는 `@ffmpeg-installer/ffmpeg`로 자동 포함됩니다.

## 빌드 스택

- Electron 33
- React 18 + TypeScript
- Vite + vite-plugin-electron
- FFmpeg / FFprobe (via npm 패키지)
