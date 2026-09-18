import type { ElementType } from "@/components/design/types";

/**
 * 元素独有属性的表单描述。
 *
 * 新增元素类型或字段时，只需在这里补充 JSON 配置；属性面板会据此渲染并回写元素。
 * path 支持点路径，因此例如 line.stroke.color 可以直接配置。
 */
export type PropertyFieldType = "text" | "number" | "color" | "select" | "textarea" | "image";

export interface PropertyFieldConfig {
  key: string;
  label: string;
  path: string;
  type: PropertyFieldType;
  min?: number;
  step?: number;
  placeholder?: string;
  /** 面板展示单位；元素模型仍统一存储为 mm。 */
  displayUnit?: "pt" | "px";
  options?: Array<{ label: string; value: string }>;
  /** 上传控件的文件体积上限（字节），仅 type === "image" 时生效 */
  maxSize?: number;
  /** 上传控件的单边像素上限，仅 type === "image" 时生效 */
  maxDimension?: number;
}

export interface PropertySectionConfig {
  title: string;
  fields: PropertyFieldConfig[];
}

export const ELEMENT_PROPERTY_CONFIG: Record<ElementType, PropertySectionConfig[]> = {
  text: [
    {
      title: "文本样式",
      fields: [
        {
          key: "content",
          label: "内容",
          path: "content",
          type: "textarea",
          placeholder: "请输入文本"
        },

        {
          key: "fontFamily",
          label: "字体",
          path: "fontFamily",
          type: "select",
          options: [
            // SelectItem 不接受空字符串；面板写回时会将该内部值转换为默认字体。
            { label: "默认字体", value: "__default_font__" },
            { label: "微软雅黑", value: "Microsoft YaHei" },
            { label: "宋体", value: "SimSun" },
            { label: "黑体", value: "SimHei" },
            { label: "楷体", value: "KaiTi" },
            { label: "Arial", value: "Arial" }
          ]
        },
        {
          key: "fontSize",
          label: "字号（pt）",
          path: "fontSize",
          type: "select",
          displayUnit: "pt",
          options: [
            { label: "初号", value: "42" },
            { label: "小初", value: "36" },
            { label: "一号", value: "26" },
            { label: "小一", value: "24" },
            { label: "二号", value: "22" },
            { label: "小二", value: "18" },
            { label: "三号", value: "16" },
            { label: "小三", value: "15" },
            { label: "四号", value: "14" },
            { label: "小四", value: "12" },
            { label: "五号", value: "10.5" },
            { label: "小五", value: "9" },
            { label: "六号", value: "7.5" },
            { label: "小六", value: "6.5" },
            { label: "七号", value: "5.5" },
            { label: "八号", value: "5" },
            { label: "48", value: "48" },
            { label: "72", value: "72" }
          ]
        },
        { key: "color", label: "颜色", path: "color", type: "color" },
        {
          key: "fontWeight",
          label: "字重",
          path: "fontWeight",
          type: "select",
          options: [
            { label: "常规", value: "normal" },
            { label: "粗体", value: "bold" }
          ]
        }
      ]
    },
    {
      title: "对齐方式",
      fields: [
        {
          key: "layout",
          label: "排布方式",
          path: "layout",
          type: "select",
          options: [
            { label: "水平", value: "horizontal" },
            { label: "垂直", value: "vertical" }
          ]
        },
        {
          key: "textAlign",
          label: "水平对齐",
          path: "textAlign",
          type: "select",
          options: [
            { label: "左对齐", value: "left" },
            { label: "居中", value: "center" },
            { label: "右对齐", value: "right" }
          ]
        },
        {
          key: "verticalAlign",
          label: "垂直对齐",
          path: "verticalAlign",
          type: "select",
          options: [
            { label: "顶部", value: "top" },
            { label: "中部", value: "middle" },
            { label: "底部", value: "bottom" }
          ]
        }
      ]
    },
    {
      title: "边框与背景",
      fields: [
        {
          key: "borderStyle",
          label: "边框样式",
          path: "borderStyle",
          type: "select",
          options: [
            { label: "无边框", value: "none" },
            { label: "实线", value: "solid" },
            { label: "虚线", value: "dashed" },
            { label: "点线", value: "dotted" }
          ]
        },
        {
          key: "borderWidth",
          label: "边框宽度（px）",
          path: "borderWidth",
          type: "number",
          displayUnit: "px",
          min: 0,
          step: 1
        },
        { key: "borderColor", label: "边框颜色", path: "borderColor", type: "color" },
        { key: "backgroundColor", label: "背景色", path: "backgroundColor", type: "color" }
      ]
    }
  ],
  table: [
    {
      /*
        这里刻意**没有**"行数 / 列数"输入框。
        新模型下 rows/cols 是派生值（以 rowHeights/colWidths 的长度为准），
        直接改数字会让 cells 数组与网格尺寸脱节 —— 而增删行列是结构化操作，
        得同时维护合并格、行角色、选区等一串东西，不是一句 Object.assign 能表达的。
        入口统一收在"进入表格编辑态"之后的右键菜单 / 行列表头里。
      */
      title: "表格默认样式",
      fields: [
        { key: "borderColor", label: "默认边框颜色", path: "cellStyle.borderColor", type: "color" },
        {
          key: "borderWidth",
          label: "默认边框宽度（px）",
          path: "cellStyle.borderWidth",
          type: "number",
          displayUnit: "px",
          min: 0,
          step: 0.1
        },
        {
          key: "padding",
          label: "默认单元格内边距",
          path: "cellStyle.padding",
          type: "number",
          min: 0,
          step: 0.1
        }
      ]
    }
  ],
  line: [
    {
      title: "线条样式",
      fields: [
        { key: "strokeColor", label: "颜色", path: "stroke.color", type: "color" },
        {
          key: "strokeWidth",
          label: "线宽(px)",
          path: "stroke.width",
          type: "number",
          displayUnit: "px",
          min: 1,
          step: 1
        },
        {
          key: "dash",
          label: "虚线间隔",
          path: "dash",
          type: "text",
          placeholder: "留空为实线，例如 2, 1"
        }
      ]
    }
  ],
  image: [
    {
      title: "图片设置",
      fields: [
        {
          key: "src",
          label: "图片",
          path: "src",
          type: "image",
          // 上限口径按"打印够用"定，不按网页优化定：A4 宽 210mm 要 300dpi 出图需 2480px，
          // 4096 是给满版出血留的余量，再往下砍就会印糊。
          maxSize: 5 * 1024 * 1024,
          maxDimension: 4096
        },
        {
          key: "objectFit",
          label: "填充方式",
          path: "objectFit",
          type: "select",
          options: [
            { label: "拉伸", value: "fill" },
            { label: "包含", value: "contain" },
            { label: "裁切填满", value: "cover" },
            { label: "原始尺寸", value: "none" }
          ]
        }
      ]
    }
  ]
};
