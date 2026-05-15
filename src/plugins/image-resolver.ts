/**
 * Image path resolution for the content parser pipeline.
 *
 * Resolves relative image paths relative to the source markdown file's directory
 * and copies referenced assets to the output directory during build.
 *
 * Requirements: 7.5
 */

import path from 'path';
import fs from 'fs/promises';

/**
 * Resolves a relative image path relative to the source markdown file's directory.
 *
 * For any markdown file at path P containing a relative image reference R,
 * the resolved path equals the directory of P joined with R, normalized to
 * remove `../` traversals correctly.
 *
 * @param imagePath - The relative image path from the markdown file
 * @param markdownFilePath - The path to the markdown file containing the reference
 * @returns The resolved absolute path to the image
 */
export function resolveImagePath(
  imagePath: string,
  markdownFilePath: string
): string {
  // Get the directory of the markdown file
  const markdownDir = path.dirname(markdownFilePath);

  // Join the markdown directory with the relative image path
  const joined = path.join(markdownDir, imagePath);

  // Normalize to resolve ../ traversals and clean up the path
  return path.normalize(joined);
}

/**
 * Copies referenced image assets to the output directory.
 * Logs warnings for missing images without throwing.
 *
 * @param images - Array of {originalPath, resolvedPath} pairs
 * @param outputDir - The output directory to copy assets to
 * @returns Array of {originalPath, outputPath} for successfully copied images
 */
export async function copyImageAssets(
  images: Array<{ originalPath: string; resolvedPath: string }>,
  outputDir: string
): Promise<Array<{ originalPath: string; outputPath: string }>> {
  const results: Array<{ originalPath: string; outputPath: string }> = [];

  for (const image of images) {
    const { originalPath, resolvedPath } = image;

    // Determine the output path: place the image in the output directory
    // preserving just the filename (or a relative structure if needed)
    const fileName = path.basename(resolvedPath);
    const outputPath = path.join(outputDir, fileName);

    try {
      // Check if the source file exists
      await fs.access(resolvedPath);

      // Ensure the output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Copy the file
      await fs.copyFile(resolvedPath, outputPath);

      results.push({ originalPath, outputPath });
    } catch {
      // Log warning for missing images, don't throw
      console.warn(
        `[image-resolver] Warning: Image not found at "${resolvedPath}" (referenced as "${originalPath}"). Skipping.`
      );
    }
  }

  return results;
}
