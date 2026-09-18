/**
 * 本地图片 → dataURL 的读取与校验。
 *
 * 为什么 base64 是"必须"而不是妥协：外链图片在导出 canvas / 打印时会让画布被跨域污染
 * （toDataURL 直接抛错），dataURL 同源不受限。
 *
 * 为什么抽成独立模块：现在有两个入口（属性面板的图片源控件、表格单元格右键的"插入图片"），
 * 两边必须用**同一套上限口径** —— 否则会出现"面板传不上去、右键却能传"这种
 * 让人怀疑软件有 bug 的差异。
 */

/** 文件体积上限：按"打印够用"定，不按网页优化定。A4 宽 210mm 要 300dpi 出图需 2480px */
export const IMAGE_MAX_SIZE = 5 * 1024 * 1024;
/** 单边像素上限：给满版出血留的余量，再往下砍就会印糊 */
export const IMAGE_MAX_DIMENSION = 4096;

export interface ImageFileResult {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
  size: number;
}

/** 校验类错误：message 是给用户看的中文原因，调用方可以直接展示 */
export class ImageReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageReadError";
  }
}

export function formatImageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

/** 解码探测原始像素。用 window.Image 避免与图标组件的命名空间纠缠 */
function probeImage(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const probe = new window.Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => reject(new Error("decode failed"));
    probe.src = url;
  });
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export async function readImageFile(
  file: File,
  options: { maxSize?: number; maxDimension?: number } = {}
): Promise<ImageFileResult> {
  const maxSize = options.maxSize ?? IMAGE_MAX_SIZE;
  const maxDimension = options.maxDimension ?? IMAGE_MAX_DIMENSION;

  if (!file.type.startsWith("image/")) {
    throw new ImageReadError(`不是图片文件（${file.type || "未知类型"}）`);
  }
  if (file.size > maxSize) {
    throw new ImageReadError(`图片 ${formatImageSize(file.size)}，超过 ${formatImageSize(maxSize)} 上限`);
  }

  let objectUrl = "";
  try {
    // 先用 objectURL 探尺寸：超限就不必读 base64 了（大文件读一遍要几百毫秒）
    objectUrl = URL.createObjectURL(file);
    const size = await probeImage(objectUrl);
    if (size.width > maxDimension || size.height > maxDimension) {
      throw new ImageReadError(
        `图片 ${size.width}×${size.height}px，超过最长边 ${maxDimension}px 上限`
      );
    }
    const dataUrl = await readAsDataUrl(file);
    return { dataUrl, width: size.width, height: size.height, name: file.name, size: file.size };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
