export function normalizeContentBounds(bounds, size) {
    const width = Math.max(1, Number(size?.width) || 1);
    const height = Math.max(1, Number(size?.height) || 1);
    if (!bounds) return { x: 0, y: 0, width, height };
    const x = Math.max(0, Math.min(width, Number(bounds.x) || 0));
    const y = Math.max(0, Math.min(height, Number(bounds.y) || 0));
    const right = Math.max(x, Math.min(width, x + (Number(bounds.width) || 0)));
    const bottom = Math.max(y, Math.min(height, y + (Number(bounds.height) || 0)));
    if (right <= x || bottom <= y) return { x: 0, y: 0, width, height };
    return { x, y, width: right - x, height: bottom - y };
}

export function findAlphaContentBounds(pixels, width, height, alphaThreshold = 8) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (pixels[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    return maxX < minX || maxY < minY
        ? null
        : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function measureImageContent(src, { maxSampleDimension = 1024, alphaThreshold = 8 } = {}) {
    const image = new Image();
    image.src = src;
    await new Promise((resolve, reject) => {
        if (image.complete && image.naturalWidth) resolve();
        else {
            image.onload = resolve;
            image.onerror = reject;
        }
    });
    const size = {
        width: Math.max(1, image.naturalWidth || 1),
        height: Math.max(1, image.naturalHeight || 1),
    };
    const sampleScale = Math.min(1, maxSampleDimension / Math.max(size.width, size.height));
    const sampleWidth = Math.max(1, Math.round(size.width * sampleScale));
    const sampleHeight = Math.max(1, Math.round(size.height * sampleScale));
    try {
        const canvas = document.createElement('canvas');
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
        const sampled = findAlphaContentBounds(
            context.getImageData(0, 0, sampleWidth, sampleHeight).data,
            sampleWidth,
            sampleHeight,
            alphaThreshold,
        );
        if (!sampled) return { size, contentBounds: normalizeContentBounds(null, size) };
        const right = Math.ceil((sampled.x + sampled.width) / sampleScale);
        const bottom = Math.ceil((sampled.y + sampled.height) / sampleScale);
        return {
            size,
            contentBounds: normalizeContentBounds({
                x: Math.floor(sampled.x / sampleScale),
                y: Math.floor(sampled.y / sampleScale),
                width: right - Math.floor(sampled.x / sampleScale),
                height: bottom - Math.floor(sampled.y / sampleScale),
            }, size),
        };
    } catch {
        return { size, contentBounds: normalizeContentBounds(null, size) };
    }
}
