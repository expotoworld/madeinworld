#!/usr/bin/env xcrun swift
import Foundation
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func overlayDevBanner(inputPath: String, outputPath: String) throws {
    let inURL = URL(fileURLWithPath: inputPath)
    guard let nsimg = NSImage(contentsOf: inURL) else {
        throw NSError(domain: "dev_icon_overlay", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to load image at \(inputPath)"])
    }
    var proposed = CGRect(origin: .zero, size: nsimg.size)
    guard let baseCG = nsimg.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else {
        throw NSError(domain: "dev_icon_overlay", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to get CGImage from NSImage"]) }

    let width = baseCG.width
    let height = baseCG.height
    let size = CGSize(width: width, height: height)

    guard let ctx = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        throw NSError(domain: "dev_icon_overlay", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to create bitmap context"]) }

    // Draw base image
    ctx.draw(baseCG, in: CGRect(origin: .zero, size: size))

    // Draw banner
    let bannerHeight = size.height * 0.24
    let bannerRect = CGRect(x: 0, y: 0, width: size.width, height: bannerHeight)
    ctx.setFillColor(NSColor(calibratedWhite: 0.0, alpha: 0.6).cgColor)
    ctx.fill(bannerRect)

    // Draw text using NSAttributedString via NSGraphicsContext backed by our CGContext
    NSGraphicsContext.saveGraphicsState()
    let nsctx = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = nsctx
    let fontSize = max(10, size.width * 0.22)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.boldSystemFont(ofSize: fontSize),
        .foregroundColor: NSColor.white
    ]
    let text = NSString(string: "DEV")
    let textSize = text.size(withAttributes: attrs)
    let textRect = CGRect(
        x: (size.width - textSize.width) / 2.0,
        y: (bannerHeight - textSize.height) / 2.0,
        width: textSize.width,
        height: textSize.height
    )
    text.draw(in: textRect, withAttributes: attrs)
    NSGraphicsContext.restoreGraphicsState()

    guard let outCG = ctx.makeImage() else {
        throw NSError(domain: "dev_icon_overlay", code: 4, userInfo: [NSLocalizedDescriptionKey: "Failed to create CGImage from context"]) }

    let outURL = URL(fileURLWithPath: outputPath) as CFURL
    guard let dest = CGImageDestinationCreateWithURL(outURL, UTType.png.identifier as CFString, 1, nil) else {
        throw NSError(domain: "dev_icon_overlay", code: 5, userInfo: [NSLocalizedDescriptionKey: "Failed to create image destination"]) }
    CGImageDestinationAddImage(dest, outCG, nil)
    guard CGImageDestinationFinalize(dest) else {
        throw NSError(domain: "dev_icon_overlay", code: 6, userInfo: [NSLocalizedDescriptionKey: "Failed to write PNG"]) }
}

let args = CommandLine.arguments
if args.count < 3 {
    fputs("Usage: dev_icon_overlay.swift <input.png> <output.png>\n", stderr)
    exit(64)
}

do {
    try overlayDevBanner(inputPath: args[1], outputPath: args[2])
} catch {
    fputs("Error: \(error)\n", stderr)
    exit(1)
}

