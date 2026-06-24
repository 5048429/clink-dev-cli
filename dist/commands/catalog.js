import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createImageUploadFormFromAsset, inspectImageFile, inspectImageUrl, isHttpUrl, loadImageUploadAsset, } from "../catalog-images.js";
import { printResult } from "../output.js";
import { getCommandContext } from "./helpers.js";
const DEFAULT_MAPPING_FILE = ".clink/catalog-map.json";
const DEFAULT_TAX_CATEGORY = "software_service";
const DEFAULT_RECURRING_INTERVAL = "month";
const DEFAULT_PRICING_MODEL = "flat_rate";
const SUPPORTED_CURRENCIES = new Set([
    "USD",
    "EUR",
    "JPY",
    "GBP",
    "AUD",
    "CAD",
    "CNY",
    "HKD",
    "SGD",
    "KRW",
    "AED",
    "THB",
    "IDR",
    "PHP",
    "MYR",
    "BRL",
    "INR",
]);
const SUPPORTED_RECURRING_INTERVALS = new Set(["day", "week", "month", "year", "quarter", "half_year", "custom"]);
const SUPPORTED_PRICING_MODELS = new Set(["flat_rate", "per_seat", "tiered", "usage_based"]);
export function registerCatalog(program) {
    const catalog = program
        .command("catalog")
        .description("Validate, plan, and import AI-discovered product catalogs");
    catalog
        .command("validate")
        .description("Validate a catalog JSON file produced by an agent")
        .requiredOption("--file <path>", "Catalog JSON file")
        .option("--default-image-id <ossId>", "Fallback product image OSS ID for products without imageId")
        .option("--project-root <path>", "Project root for resolving catalog imageFile paths")
        .option("--public-dir <path>", "Public/static asset directory for root-relative imageFile paths")
        .action(async (options, command) => {
        const { config } = await getCommandContext(command);
        const validation = await readAndValidateCatalog(options.file, options.defaultImageId, imageResolveOptions(options));
        printResult(validation, config.outputMode, validation.ok
            ? `Catalog is valid: ${validation.catalog?.products.length ?? 0} product(s)`
            : formatValidationIssues(validation));
        if (!validation.ok)
            process.exitCode = 1;
    });
    catalog
        .command("plan")
        .description("Show which catalog products and prices would be created or skipped")
        .requiredOption("--file <path>", "Catalog JSON file")
        .option("--mapping-file <path>", "Catalog mapping file", DEFAULT_MAPPING_FILE)
        .option("--default-image-id <ossId>", "Fallback product image OSS ID for products without imageId")
        .option("--project-root <path>", "Project root for resolving catalog imageFile paths")
        .option("--public-dir <path>", "Public/static asset directory for root-relative imageFile paths")
        .option("--force", "Plan recreation even when mapping entries exist")
        .action(async (options, command) => {
        const { config } = await getCommandContext(command);
        const validation = await readAndValidateCatalog(options.file, options.defaultImageId, imageResolveOptions(options));
        if (!validation.ok || !validation.catalog) {
            printResult(validation, config.outputMode, formatValidationIssues(validation));
            process.exitCode = 1;
            return;
        }
        const mapping = await readCatalogMapping(options.mappingFile);
        const plan = buildCatalogPlan(validation.catalog, mapping, Boolean(options.force));
        printResult({
            ok: true,
            catalogFile: options.file,
            mappingFile: options.mappingFile,
            force: Boolean(options.force),
            ...plan,
        }, config.outputMode, formatPlan(plan.products));
    });
    catalog
        .command("import")
        .description("Create catalog products and prices in Clink and save sourceId mappings")
        .requiredOption("--file <path>", "Catalog JSON file")
        .option("--mapping-file <path>", "Catalog mapping file", DEFAULT_MAPPING_FILE)
        .option("--default-image-id <ossId>", "Fallback product image OSS ID for products without imageId")
        .option("--project-root <path>", "Project root for resolving catalog imageFile paths")
        .option("--public-dir <path>", "Public/static asset directory for root-relative imageFile paths")
        .option("--force", "Create new Clink products even when mapping entries exist")
        .action(async (options, command) => {
        const { config, client } = await getCommandContext(command);
        const validation = await readAndValidateCatalog(options.file, options.defaultImageId, imageResolveOptions(options));
        if (!validation.ok || !validation.catalog) {
            printResult(validation, config.outputMode, formatValidationIssues(validation));
            process.exitCode = 1;
            return;
        }
        const mapping = await readCatalogMapping(options.mappingFile);
        const result = await importCatalog(validation.catalog, mapping, {
            force: Boolean(options.force),
            dryRun: config.dryRun,
            postProduct: (body) => client.post("/product", { body }),
            postPrice: (body) => client.post("/price", { body }),
            uploadImage: (form) => client.post("/product/image/upload", { multipart: form }),
        });
        if (!config.dryRun) {
            await writeCatalogMapping(options.mappingFile, result.mapping);
        }
        printResult({
            ok: true,
            catalogFile: options.file,
            mappingFile: options.mappingFile,
            mappingSaved: !config.dryRun,
            dryRun: config.dryRun,
            summary: result.summary,
            operations: result.operations,
        }, config.outputMode, `Catalog import ${config.dryRun ? "dry-run " : ""}completed: ${result.summary.createdProducts} product(s), ${result.summary.createdPrices} price(s) created.`);
    });
}
function imageResolveOptions(options) {
    return {
        catalogFilePath: options.file,
        projectRoot: options.projectRoot,
        publicDir: options.publicDir,
    };
}
async function readAndValidateCatalog(filePath, defaultImageId, imageOptions = { catalogFilePath: filePath }) {
    let raw;
    try {
        raw = JSON.parse(stripJsonBom(await readFile(filePath, "utf8")));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            ok: false,
            errors: [{ path: "$", message: `Could not read catalog JSON: ${message}` }],
            warnings: [],
        };
    }
    return normalizeCatalog(raw, defaultImageId, imageOptions);
}
async function normalizeCatalog(raw, defaultImageId, imageOptions) {
    const errors = [];
    const warnings = [];
    const root = asRecord(raw);
    if (!root) {
        return {
            ok: false,
            errors: [{ path: "$", message: "Catalog must be a JSON object" }],
            warnings,
        };
    }
    const rawProducts = Array.isArray(root.products) ? root.products : undefined;
    if (!rawProducts) {
        errors.push({ path: "$.products", message: "Catalog must include a products array" });
    }
    const productSourceIds = new Set();
    const products = [];
    if (defaultImageId && isHttpUrl(defaultImageId)) {
        errors.push({ path: "$.--default-image-id", message: "defaultImageId must be an uploaded OSS ID, not a URL. Use imageUrl in the catalog instead." });
    }
    for (const [index, value] of (rawProducts ?? []).entries()) {
        const path = `$.products[${index}]`;
        const product = asRecord(value);
        if (!product) {
            errors.push({ path, message: "Product must be an object" });
            continue;
        }
        const sourceId = requiredString(product.sourceId, `${path}.sourceId`, errors);
        const name = requiredString(product.name, `${path}.name`, errors);
        const imageSource = await normalizeImageSource(product, path, defaultImageId, imageOptions, errors);
        const taxCategory = optionalString(product.taxCategory) ?? DEFAULT_TAX_CATEGORY;
        if (!isTaxCategory(taxCategory)) {
            errors.push({ path: `${path}.taxCategory`, message: "taxCategory must be digital_goods_or_service, ebook, or software_service" });
        }
        if (sourceId) {
            if (productSourceIds.has(sourceId)) {
                errors.push({ path: `${path}.sourceId`, message: `Duplicate product sourceId "${sourceId}"` });
            }
            productSourceIds.add(sourceId);
        }
        const rawPrices = Array.isArray(product.prices)
            ? product.prices
            : Array.isArray(product.priceList)
                ? product.priceList
                : undefined;
        if (!rawPrices || rawPrices.length === 0) {
            errors.push({ path: `${path}.prices`, message: "Product must include at least one price" });
        }
        const priceSourceIds = new Set();
        const prices = [];
        (rawPrices ?? []).forEach((priceValue, priceIndex) => {
            const pricePath = `${path}.prices[${priceIndex}]`;
            const price = asRecord(priceValue);
            if (!price) {
                errors.push({ path: pricePath, message: "Price must be an object" });
                return;
            }
            const priceSourceId = requiredString(price.sourceId, `${pricePath}.sourceId`, errors);
            if (priceSourceId) {
                if (priceSourceIds.has(priceSourceId)) {
                    errors.push({ path: `${pricePath}.sourceId`, message: `Duplicate price sourceId "${priceSourceId}" in product "${sourceId ?? index}"` });
                }
                priceSourceIds.add(priceSourceId);
            }
            const amount = requiredNumber(price.amount ?? price.unitAmount, `${pricePath}.amount`, errors);
            const currency = (requiredString(price.currency, `${pricePath}.currency`, errors) ?? "").toUpperCase();
            const type = optionalString(price.type) ?? optionalString(price.priceType) ?? "one_time";
            const interval = optionalString(price.interval);
            const intervalCount = optionalNumber(price.intervalCount);
            const trialDays = optionalNumber(price.trialDays ?? price.trialPeriodDays);
            const pricingModel = optionalString(price.pricingModel);
            const priority = optionalNumber(price.priority);
            if (type !== "one_time" && type !== "recurring") {
                errors.push({ path: `${pricePath}.type`, message: "type must be one_time or recurring" });
            }
            if (currency && !/^[A-Z]{3}$/.test(currency)) {
                warnings.push({ path: `${pricePath}.currency`, message: "Currency should be a three-letter ISO code" });
            }
            if (currency && !SUPPORTED_CURRENCIES.has(currency)) {
                errors.push({ path: `${pricePath}.currency`, message: `currency must be one of ${Array.from(SUPPORTED_CURRENCIES).join(", ")}` });
            }
            if (amount !== undefined && amount <= 0) {
                errors.push({ path: `${pricePath}.amount`, message: "amount must be greater than 0" });
            }
            if (interval && !SUPPORTED_RECURRING_INTERVALS.has(interval)) {
                errors.push({ path: `${pricePath}.interval`, message: `interval must be one of ${Array.from(SUPPORTED_RECURRING_INTERVALS).join(", ")}` });
            }
            if (intervalCount !== undefined && (!Number.isInteger(intervalCount) || intervalCount <= 0)) {
                errors.push({ path: `${pricePath}.intervalCount`, message: "intervalCount must be a positive integer" });
            }
            if (trialDays !== undefined && (!Number.isInteger(trialDays) || trialDays < 0)) {
                errors.push({ path: `${pricePath}.trialDays`, message: "trialDays must be a non-negative integer" });
            }
            if (pricingModel && !SUPPORTED_PRICING_MODELS.has(pricingModel)) {
                errors.push({ path: `${pricePath}.pricingModel`, message: `pricingModel must be one of ${Array.from(SUPPORTED_PRICING_MODELS).join(", ")}` });
            }
            if (priority !== undefined && !Number.isInteger(priority)) {
                errors.push({ path: `${pricePath}.priority`, message: "priority must be an integer" });
            }
            prices.push({
                sourceId: priceSourceId ?? "",
                amount: amount ?? 0,
                currency,
                type: type === "recurring" ? "recurring" : "one_time",
                interval,
                intervalCount,
                trialDays,
                pricingModel,
                default: optionalBoolean(price.default ?? price.isDefaultPrice),
                priority,
            });
        });
        products.push({
            sourceId: sourceId ?? "",
            name: name ?? "",
            localizedNames: stringRecord(product.localizedNames),
            description: optionalString(product.description),
            imageId: imageSource?.kind === "id" || imageSource?.kind === "default" ? imageSource.imageId : undefined,
            imageUrl: imageSource?.kind === "url" ? imageSource.imageUrl : undefined,
            imageFile: imageSource?.kind === "file" ? imageSource.imageFile : undefined,
            imageSource: imageSource ?? { kind: "id", imageId: "", sourceField: "imageId" },
            taxCategory: isTaxCategory(taxCategory) ? taxCategory : DEFAULT_TAX_CATEGORY,
            prices,
        });
    }
    return {
        ok: errors.length === 0,
        errors,
        warnings,
        catalog: errors.length === 0
            ? {
                version: optionalNumber(root.version) ?? 1,
                source: asRecord(root.source),
                products,
            }
            : undefined,
    };
}
async function normalizeImageSource(product, path, defaultImageId, imageOptions, errors) {
    const explicitImageId = optionalString(product.imageId);
    const legacyImage = optionalString(product.image);
    const imageId = explicitImageId ?? legacyImage;
    const imageIdPath = explicitImageId ? `${path}.imageId` : `${path}.image`;
    const imageUrl = optionalString(product.imageUrl);
    const imageFile = optionalString(product.imageFile);
    const provided = [imageId, imageUrl, imageFile].filter(Boolean);
    if (provided.length > 1) {
        errors.push({ path: `${path}.image`, message: "Use only one of imageId, imageUrl, or imageFile for each product." });
        return undefined;
    }
    if (imageId) {
        if (isHttpUrl(imageId)) {
            errors.push({ path: imageIdPath, message: "imageId must be an uploaded OSS ID, not a URL. Move this value to imageUrl." });
            return undefined;
        }
        return {
            kind: "id",
            imageId,
            sourceField: explicitImageId ? "imageId" : "image",
        };
    }
    if (imageUrl) {
        if (!isHttpUrl(imageUrl)) {
            errors.push({ path: `${path}.imageUrl`, message: "imageUrl must be a valid http(s) URL." });
            return undefined;
        }
        try {
            return await inspectImageUrl(imageUrl);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push({ path: `${path}.imageUrl`, message });
            return undefined;
        }
    }
    if (imageFile) {
        if (isHttpUrl(imageFile)) {
            errors.push({ path: `${path}.imageFile`, message: "imageFile must be a local file path. Move URLs to imageUrl." });
            return undefined;
        }
        try {
            return await inspectImageFile(imageFile, imageOptions);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push({ path: `${path}.imageFile`, message });
            return undefined;
        }
    }
    if (defaultImageId && !isHttpUrl(defaultImageId)) {
        return {
            kind: "default",
            imageId: defaultImageId,
            sourceField: "defaultImageId",
        };
    }
    errors.push({ path: `${path}.imageId`, message: "Product must include imageId, imageUrl, or imageFile, or pass --default-image-id." });
    return undefined;
}
async function readCatalogMapping(filePath) {
    try {
        const parsed = JSON.parse(stripJsonBom(await readFile(filePath, "utf8")));
        return {
            version: 1,
            generatedBy: "clink-dev-cli",
            updatedAt: parsed.updatedAt,
            products: parsed.products ?? {},
            assets: parsed.assets ?? {},
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return emptyMapping();
        }
        throw error;
    }
}
async function writeCatalogMapping(filePath, mapping) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify({ ...mapping, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}
function emptyMapping() {
    return {
        version: 1,
        generatedBy: "clink-dev-cli",
        products: {},
        assets: {},
    };
}
function buildCatalogPlan(catalog, mapping, force) {
    const products = catalog.products.map((product) => {
        const mappedProduct = mapping.products[product.sourceId];
        const createProduct = force || !mappedProduct;
        const image = planImage(product, mapping, createProduct);
        const prices = product.prices.map((price) => {
            const mappedPrice = mappedProduct?.prices?.[price.sourceId];
            const action = createProduct
                ? "create_with_product"
                : mappedPrice
                    ? "skip_existing_price"
                    : "create_price";
            return {
                sourceId: price.sourceId,
                action,
                priceId: mappedPrice?.priceId,
                amount: price.amount,
                currency: price.currency,
                type: price.type,
            };
        });
        return {
            sourceId: product.sourceId,
            name: product.name,
            action: createProduct ? "create_product" : "skip_existing_product",
            productId: mappedProduct?.productId,
            image,
            prices,
        };
    });
    return {
        products,
        summary: summarizePlan(products),
    };
}
function planImage(product, mapping, willCreateProduct) {
    const source = product.imageSource;
    if (!willCreateProduct) {
        return {
            action: "skip_existing_product",
            sourceKind: source.kind,
            source: imageSourceLabel(source),
            ossId: source.kind === "id" || source.kind === "default" ? source.imageId : undefined,
            sha256: imageSourceSha(source),
            mimeType: imageSourceMime(source),
            sizeBytes: imageSourceSize(source),
        };
    }
    if (source.kind === "id") {
        return {
            action: "skip_existing_image_id",
            sourceKind: source.kind,
            source: source.imageId,
            ossId: source.imageId,
        };
    }
    if (source.kind === "default") {
        return {
            action: "use_default_image_id",
            sourceKind: source.kind,
            source: source.imageId,
            ossId: source.imageId,
        };
    }
    const cached = mapping.assets?.[source.sha256];
    return {
        action: cached?.ossId ? "reuse_cached_upload" : "upload",
        sourceKind: source.kind,
        source: imageSourceLabel(source),
        ossId: cached?.ossId,
        sha256: source.sha256,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
    };
}
async function importCatalog(catalog, mapping, options) {
    const operations = [];
    const summary = {
        createdProducts: 0,
        createdPrices: 0,
        skippedProducts: 0,
        skippedPrices: 0,
        uploadedImages: 0,
        reusedImages: 0,
        skippedImages: 0,
    };
    for (const product of catalog.products) {
        const mappedProduct = mapping.products[product.sourceId];
        const shouldCreateProduct = options.force || !mappedProduct;
        if (shouldCreateProduct) {
            const imageResult = await resolveProductImage(product, mapping, options);
            operations.push({
                sourceId: product.sourceId,
                action: imageResult.action,
                image: imageResult.image,
                result: imageResult.result,
            });
            if (imageResult.action === "upload_image")
                summary.uploadedImages += 1;
            if (imageResult.action === "reuse_image_upload")
                summary.reusedImages += 1;
            if (imageResult.action === "skip_image_upload")
                summary.skippedImages += 1;
            const body = productCreatePayload(product, imageResult.ossId);
            const result = await options.postProduct(body);
            const ids = extractProductIds(result);
            operations.push({
                sourceId: product.sourceId,
                action: "create_product",
                requestBody: body,
                result,
                productId: ids.productId,
            });
            summary.createdProducts += 1;
            summary.createdPrices += product.prices.length;
            if (!options.dryRun && !ids.productId) {
                throw new Error(`Clink product create response did not include productId for catalog product "${product.sourceId}"`);
            }
            if (!options.dryRun && ids.productId) {
                const mappedPrices = mapCreatedPrices(product.prices, result);
                if (Object.keys(mappedPrices).length !== product.prices.length) {
                    throw new Error(`Clink product create response did not include all price IDs for catalog product "${product.sourceId}"`);
                }
                mapping.products[product.sourceId] = {
                    productId: ids.productId,
                    defaultPrice: ids.defaultPrice,
                    prices: mappedPrices,
                };
            }
            continue;
        }
        summary.skippedProducts += 1;
        summary.skippedImages += 1;
        operations.push({
            sourceId: product.sourceId,
            action: "skip_existing_product",
            productId: mappedProduct.productId,
            image: planImage(product, mapping, false),
        });
        for (const price of product.prices) {
            const mappedPrice = mappedProduct.prices[price.sourceId];
            if (mappedPrice && !options.force) {
                summary.skippedPrices += 1;
                operations.push({
                    sourceId: product.sourceId,
                    priceSourceId: price.sourceId,
                    action: "skip_existing_price",
                    productId: mappedProduct.productId,
                    priceId: mappedPrice.priceId,
                });
                continue;
            }
            const body = priceCreatePayload(mappedProduct.productId, price);
            const result = await options.postPrice(body);
            const priceId = extractPriceId(result);
            summary.createdPrices += 1;
            operations.push({
                sourceId: product.sourceId,
                priceSourceId: price.sourceId,
                action: "create_price",
                requestBody: body,
                result,
                priceId,
            });
            if (!options.dryRun && !priceId) {
                throw new Error(`Clink price create response did not include priceId for catalog price "${product.sourceId}/${price.sourceId}"`);
            }
            if (!options.dryRun && priceId) {
                mappedProduct.prices[price.sourceId] = {
                    priceId,
                    type: price.type,
                    amount: price.amount,
                    currency: price.currency,
                };
            }
        }
    }
    return {
        mapping,
        summary,
        operations,
    };
}
async function resolveProductImage(product, mapping, options) {
    const source = product.imageSource;
    if (source.kind === "id" || source.kind === "default") {
        return {
            action: "skip_image_upload",
            ossId: source.imageId,
            image: planImage(product, mapping, true),
        };
    }
    mapping.assets = mapping.assets ?? {};
    const cached = mapping.assets[source.sha256];
    if (cached?.ossId) {
        return {
            action: "reuse_image_upload",
            ossId: cached.ossId,
            image: planImage(product, mapping, true),
        };
    }
    const asset = await loadImageUploadAsset(source);
    const form = createImageUploadFormFromAsset(asset);
    const result = await options.uploadImage(form);
    const ossId = options.dryRun ? dryRunOssId(asset.sha256) : extractOssId(result);
    if (!ossId) {
        throw new Error(`Clink image upload response did not include ossId for catalog product "${product.sourceId}"`);
    }
    mapping.assets[asset.sha256] = {
        ossId,
        sourceKind: asset.sourceKind,
        source: asset.source,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        updatedAt: new Date().toISOString(),
    };
    return {
        action: "upload_image",
        ossId,
        image: {
            action: "upload",
            sourceKind: source.kind,
            source: imageSourceLabel(source),
            ossId,
            sha256: asset.sha256,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
        },
        result,
    };
}
function productCreatePayload(product, imageId) {
    return {
        name: product.name,
        localizedNames: product.localizedNames,
        description: product.description,
        image: imageId,
        taxCategory: product.taxCategory,
        priceList: product.prices.map(productPricePayload),
    };
}
function productPricePayload(price) {
    const item = {
        currency: price.currency,
        unitAmount: price.amount,
        priceType: price.type,
        isDefaultPrice: Boolean(price.default),
        priority: price.priority,
    };
    if (price.type === "recurring") {
        item.recurringDetails = recurringDetails(price);
    }
    return item;
}
function priceCreatePayload(productId, price) {
    const body = {
        productId,
        currency: price.currency,
        unitAmount: price.amount,
        priceType: price.type,
        isDefaultPrice: Boolean(price.default),
    };
    if (price.type === "recurring") {
        body.recurringDetails = recurringDetails(price);
    }
    return body;
}
function recurringDetails(price) {
    return {
        interval: (price.interval ?? DEFAULT_RECURRING_INTERVAL),
        intervalCount: price.intervalCount ?? 1,
        trialPeriodDays: price.trialDays,
        pricingModel: (price.pricingModel ?? DEFAULT_PRICING_MODEL),
    };
}
function mapCreatedPrices(prices, result) {
    const mapped = {};
    const data = result && typeof result === "object" ? result.data : undefined;
    const resultPrices = Array.isArray(data?.priceList) ? data.priceList : [];
    prices.forEach((price, index) => {
        const raw = resultPrices[index] && typeof resultPrices[index] === "object" ? resultPrices[index] : undefined;
        const priceId = stringValue(raw?.priceId) ?? (price.default ? stringValue(data?.defaultPrice) : undefined);
        if (priceId) {
            mapped[price.sourceId] = {
                priceId,
                type: price.type,
                amount: price.amount,
                currency: price.currency,
            };
        }
    });
    return mapped;
}
function extractProductIds(result) {
    const data = result && typeof result === "object" ? result.data : undefined;
    return {
        productId: stringValue(data?.productId),
        defaultPrice: stringValue(data?.defaultPrice),
    };
}
function extractPriceId(result) {
    const data = result && typeof result === "object" ? result.data : undefined;
    return stringValue(data?.priceId);
}
function extractOssId(result) {
    const data = result && typeof result === "object" ? result.data : undefined;
    return stringValue(data?.ossId);
}
function dryRunOssId(sha256) {
    return `dry_run_oss_${sha256.slice(0, 16)}`;
}
function summarizePlan(products) {
    const images = products.map((product) => product.image);
    return {
        createProducts: products.filter((product) => product.action === "create_product").length,
        skipProducts: products.filter((product) => product.action === "skip_existing_product").length,
        createPrices: products.flatMap((product) => product.prices).filter((price) => price.action !== "skip_existing_price").length,
        skipPrices: products.flatMap((product) => product.prices).filter((price) => price.action === "skip_existing_price").length,
        uploadImages: images.filter((image) => image.action === "upload").length,
        reuseImages: images.filter((image) => image.action === "reuse_cached_upload").length,
        skipImages: images.filter((image) => image.action !== "upload" && image.action !== "reuse_cached_upload").length,
    };
}
function formatValidationIssues(validation) {
    const lines = [
        ...validation.errors.map((issue) => `[error] ${issue.path}: ${issue.message}`),
        ...validation.warnings.map((issue) => `[warn] ${issue.path}: ${issue.message}`),
    ];
    return lines.length > 0 ? lines.join("\n") : "Catalog validation completed.";
}
function formatPlan(products) {
    if (products.length === 0)
        return "Catalog contains no products.";
    return products
        .map((product) => {
        const priceSummary = product.prices
            .map((price) => `${price.action}:${price.sourceId}`)
            .join(", ");
        const imageSummary = `image=${product.image.action}:${product.image.source}`;
        return `${product.action}: ${product.sourceId} (${product.name}) ${imageSummary}${priceSummary ? ` -> ${priceSummary}` : ""}`;
    })
        .join("\n");
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
function requiredString(value, path, errors) {
    const text = optionalString(value);
    if (!text) {
        errors.push({ path, message: "Required string is missing" });
        return undefined;
    }
    return text;
}
function requiredNumber(value, path, errors) {
    const parsed = optionalNumber(value);
    if (parsed === undefined) {
        errors.push({ path, message: "Required number is missing" });
        return undefined;
    }
    return parsed;
}
function optionalString(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
function optionalNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
        return Number(value);
    return undefined;
}
function optionalBoolean(value) {
    if (typeof value === "boolean")
        return value;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    return undefined;
}
function stringRecord(value) {
    const record = asRecord(value);
    if (!record)
        return undefined;
    const result = {};
    for (const [key, nestedValue] of Object.entries(record)) {
        if (typeof nestedValue === "string") {
            result[key] = nestedValue;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
function isTaxCategory(value) {
    return value === "digital_goods_or_service" || value === "ebook" || value === "software_service";
}
function imageSourceLabel(source) {
    if (source.kind === "id" || source.kind === "default")
        return source.imageId;
    if (source.kind === "file")
        return source.imageFile;
    return source.imageUrl;
}
function imageSourceSha(source) {
    return source.kind === "file" || source.kind === "url" ? source.sha256 : undefined;
}
function imageSourceMime(source) {
    return source.kind === "file" || source.kind === "url" ? source.mimeType : undefined;
}
function imageSourceSize(source) {
    return source.kind === "file" || source.kind === "url" ? source.sizeBytes : undefined;
}
function stringValue(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function stripJsonBom(raw) {
    return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}
//# sourceMappingURL=catalog.js.map