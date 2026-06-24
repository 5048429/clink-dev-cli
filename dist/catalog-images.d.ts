export declare const PRODUCT_IMAGE_MAX_BYTES: number;
export type CatalogImageSource = {
    kind: "id";
    imageId: string;
    sourceField: "imageId" | "image";
} | {
    kind: "default";
    imageId: string;
    sourceField: "defaultImageId";
} | {
    kind: "file";
    imageFile: string;
    resolvedPath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
} | {
    kind: "url";
    imageUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
};
export type CatalogImageResolveOptions = {
    catalogFilePath: string;
    projectRoot?: string;
    publicDir?: string;
};
export type ImageUploadAsset = {
    sourceKind: "file" | "url";
    source: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    buffer: Buffer;
};
export declare function isHttpUrl(value: string): boolean;
export declare function supportedImageMimeTypes(): string[];
export declare function inspectImageFile(imageFile: string, options: CatalogImageResolveOptions): Promise<CatalogImageSource>;
export declare function inspectImageUrl(imageUrl: string): Promise<CatalogImageSource>;
export declare function loadImageUploadAsset(source: CatalogImageSource): Promise<ImageUploadAsset>;
export declare function createImageUploadFormFromAsset(asset: ImageUploadAsset): FormData;
