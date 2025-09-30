import React, { useState, useRef } from 'react';
import {
  Box,
  Card,
  CardMedia,
  IconButton,
  Typography,
  Button,

  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,

  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const ImageCarousel = ({ 
  images = [], 
  onImagesChange, 
  onImageUpload, 
  onImageDelete, 
  onImageReorder, 
  onSetPrimary,
  loading = false,
  maxImages = 10 
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState(null);
  const fileInputRef = useRef(null);

  // Handle drag end for reordering
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(images);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update display orders
    const updatedImages = items.map((item, index) => ({
      ...item,
      display_order: index + 1,
    }));

    onImageReorder(updatedImages);
  };

  // Handle file selection
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      onImageUpload(files);
    }
    // Reset file input
    event.target.value = '';
  };

  // Handle delete confirmation
  const handleDeleteClick = (image) => {
    setImageToDelete(image);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (imageToDelete) {
      onImageDelete(imageToDelete.id);
      setImageToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  // Handle set primary image
  const handleSetPrimary = (imageId) => {
    onSetPrimary(imageId);
  };

  // Handle move up/down
  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newImages = [...images];
    [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    
    // Update display orders
    const updatedImages = newImages.map((item, idx) => ({
      ...item,
      display_order: idx + 1,
    }));
    
    onImageReorder(updatedImages);
  };

  const handleMoveDown = (index) => {
    if (index === images.length - 1) return;
    const newImages = [...images];
    [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
    
    // Update display orders
    const updatedImages = newImages.map((item, idx) => ({
      ...item,
      display_order: idx + 1,
    }));
    
    onImageReorder(updatedImages);
  };

  return (
    <Box>
      {/* Upload Button */}
      <Box sx={{ mb: 3 }}>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <Button
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || images.length >= maxImages}
          fullWidth
          sx={{ mb: 1 }}
        >
          {images.length === 0 ? 'Upload Images' : 'Add More Images'}
        </Button>
        <Typography variant="caption" color="text.secondary" display="block">
          {images.length}/{maxImages} images • Drag to reorder • First image is the thumbnail
        </Typography>
      </Box>

      {/* Images Grid with Drag and Drop */}
      {images.length > 0 && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="images" direction="horizontal">
            {(provided) => (
              <Box
                {...provided.droppableProps}
                ref={provided.innerRef}
                sx={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 2,
                  minHeight: 160
                }}
              >
                {images.map((image, index) => (
                  <Draggable 
                    key={image.id || index} 
                    draggableId={String(image.id || index)} 
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <Card
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        sx={{
                          width: 160,
                          position: 'relative',
                          transform: snapshot.isDragging ? 'rotate(5deg)' : 'none',
                          boxShadow: snapshot.isDragging ? 4 : 1,
                          border: image.is_primary ? '2px solid #1976d2' : '1px solid #e0e0e0',
                        }}
                      >
                        {/* Primary Badge */}
                        {image.is_primary && (
                          <Chip
                            label="Primary"
                            size="small"
                            color="primary"
                            sx={{
                              position: 'absolute',
                              top: 8,
                              left: 8,
                              zIndex: 2,
                            }}
                          />
                        )}

                        {/* Order Badge */}
                        <Chip
                          label={`#${index + 1}`}
                          size="small"
                          sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            zIndex: 2,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            color: 'white',
                          }}
                        />

                        {/* Image */}
                        <CardMedia
                          component="img"
                          height="160"
                          image={image.image_url || image.url}
                          alt={`Product image ${index + 1}`}
                          sx={{ objectFit: 'contain', bgcolor: '#f5f5f5' }}
                        />

                        {/* Action Buttons */}
                        <Box
                          sx={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 0.5,
                            p: 1,
                          }}
                        >
                          {/* Set Primary */}
                          <Tooltip title={image.is_primary ? "Primary image" : "Set as primary"}>
                            <IconButton
                              size="small"
                              onClick={() => handleSetPrimary(image.id)}
                              disabled={image.is_primary}
                              sx={{ color: 'white' }}
                            >
                              {image.is_primary ? <StarIcon /> : <StarBorderIcon />}
                            </IconButton>
                          </Tooltip>

                          {/* Move Up */}
                          <Tooltip title="Move up">
                            <IconButton
                              size="small"
                              onClick={() => handleMoveUp(index)}
                              disabled={index === 0}
                              sx={{ color: 'white' }}
                            >
                              <ArrowUpIcon />
                            </IconButton>
                          </Tooltip>

                          {/* Move Down */}
                          <Tooltip title="Move down">
                            <IconButton
                              size="small"
                              onClick={() => handleMoveDown(index)}
                              disabled={index === images.length - 1}
                              sx={{ color: 'white' }}
                            >
                              <ArrowDownIcon />
                            </IconButton>
                          </Tooltip>

                          {/* Delete */}
                          <Tooltip title="Delete image">
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteClick(image)}
                              sx={{ color: 'white' }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Box>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Empty State */}
      {images.length === 0 && (
        <Box
          sx={{
            border: '2px dashed #ccc',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            backgroundColor: '#fafafa',
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No images uploaded
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Click "Upload Images" to add product photos
          </Typography>
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Image</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this image? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ImageCarousel;
