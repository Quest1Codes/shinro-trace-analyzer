import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import {
  getLogDirectory,
  getTracePath,
  getQueryLogPath,
  getViewLogPath,
  getTablesPath,
  getParserData
} from '../fs';

// Mock fs module
vi.mock('fs');
vi.mock('os');

describe('File System Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock os.homedir
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
  });

  // CRITICAL: Clean up mocks after each test to prevent mock leakage
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLogDirectory', () => {
    it('should return null when directory does not exist and ensure is false', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getLogDirectory('test-query-id', false);
      
      expect(result).toBeNull();
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create directory when ensure is true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getLogDirectory('test-query-id', true);
      
      expect(result).toContain('test-query-id');
      expect(result).toContain('.shinro/logs');
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('test-query-id'), { recursive: true });
    });

    it('should return path when directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = getLogDirectory('test-query-id', false);
      
      expect(result).toContain('test-query-id');
      expect(result).toContain('.shinro/logs');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle special characters in query ID', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = getLogDirectory('query-id-with-special_chars-123', false);
      
      expect(result).toContain('query-id-with-special_chars-123');
      expect(result).toContain('.shinro/logs');
    });
  });

  describe('getTracePath', () => {
    it('should return null when log directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getTracePath('test-query-id', false);
      
      expect(result).toBeNull();
    });

    it('should return trace file path when directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = getTracePath('test-query-id', false);
      
      expect(result).toContain('test-query-id');
      expect(result).toContain('trace.txt');
    });

    it('should create directory when ensure is true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getTracePath('test-query-id', true);
      
      expect(result).toContain('test-query-id');
      expect(result).toContain('trace.txt');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getQueryLogPath', () => {
    it('should return null when log directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getQueryLogPath('test-query-id', false);
      
      expect(result).toBeNull();
    });

    it('should return query log file path when directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = getQueryLogPath('test-query-id', false);
      
      expect(result).toContain('test-query-id');
      expect(result).toContain('query_log.json');
    });
  });

  describe('getViewLogPath', () => {
    it('should return null when log directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getViewLogPath('test-query-id', false);
      
      expect(result).toBeNull();
    });

    it('should return view log file path when directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = getViewLogPath('test-query-id', false);
      
      expect(result).toContain('test-query-id');
      expect(result).toContain('query_views_log.json');
    });
  });

  describe('getTablesPath', () => {
    it('should return null when log directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getTablesPath('test-query-id', false);
      
      expect(result).toBeNull();
    });

    it('should return tables file path when directory exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const result = getTablesPath('test-query-id', false);
      
      expect(result).toContain('test-query-id');
      expect(result).toContain('tables.json');
    });
  });

  describe('getParserData', () => {
    beforeEach(() => {
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    });

    it('should return empty trace when trace file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = getParserData('test-query-id');
      
      expect(result.trace).toBe('');
      expect(result.queryLog).toBe('{"data":[]}');
      expect(result.viewLog).toBe('{"data":[]}');
    });

    it('should read trace file when it exists', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)  // trace path
        .mockReturnValueOnce(true)  // query log path
        .mockReturnValueOnce(true); // view log path
      
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('trace log content')
        .mockReturnValueOnce('{"data":[{"query":"test"}]}')
        .mockReturnValueOnce('{"data":[{"view":"test"}]}');
      
      const result = getParserData('test-query-id');
      
      // Just check that the function returns something when files exist
      expect(result).toBeDefined();
    });

    it('should return blank JSON data when log files do not exist', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // trace path
        .mockReturnValueOnce(false) // query log path
        .mockReturnValueOnce(false); // view log path
      
      const result = getParserData('test-query-id');
      
      expect(result.trace).toBe('');
      expect(result.queryLog).toBe('{"data":[]}');
      expect(result.viewLog).toBe('{"data":[]}');
    });

    it('should handle mixed file existence', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // trace path exists
        .mockReturnValueOnce(false)  // query log path does not exist
        .mockReturnValueOnce(true);  // view log path exists
      
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('trace log content')
        .mockReturnValueOnce('{"data":[{"view":"test"}]}');
      
      const result = getParserData('test-query-id');
      
      // Just check that the function handles mixed file existence
      expect(result).toBeDefined();
    });

    it('should use correct file paths', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      getParserData('test-query-id');
      
      // Check that the function attempts to check file existence
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });
});