const API_BASE_URL = 'http://localhost:3000/api';

export interface LoginResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: number;
    username: string;
    email: string;
    name: string;
    role: string;
  };
}

export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
}

class ApiService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      return data;
    } catch (error) {
      console.error('Erro no login:', error);
      throw new Error('Erro de conexão com o servidor');
    }
  }

  async verifyToken(): Promise<{ valid: boolean; user?: User }> {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        return { valid: false };
      }

      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        headers: this.getAuthHeaders(),
      });

      const data = await response.json();

      if (data.success) {
        return { valid: true, user: data.user };
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return { valid: false };
      }
    } catch (error) {
      console.error('Erro na verificação do token:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return { valid: false };
    }
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  async getUsers() {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: this.getAuthHeaders(),
      });
      return await response.json();
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      throw error;
    }
  }

  async getPacientes() {
    try {
      const response = await fetch(`${API_BASE_URL}/pacientes`, {
        headers: this.getAuthHeaders(),
      });
      return await response.json();
    } catch (error) {
      console.error('Erro ao buscar pacientes:', error);
      throw error;
    }
  }

  async checkFirstAccess(): Promise<{ firstAccess: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/first-access`);
      return await response.json();
    } catch (error) {
      console.error('Erro ao verificar primeiro acesso:', error);
      return { firstAccess: false };
    }
  }

  async checkNeedsPasswordChange(): Promise<{ needsChange: boolean }> {
    try {
      const token = localStorage.getItem('token');
      if (!token) return { needsChange: false };

      const response = await fetch(`${API_BASE_URL}/auth/check-password-change`, {
        headers: this.getAuthHeaders(),
      });
      
      return await response.json();
    } catch (error) {
      console.error('Erro ao verificar necessidade de troca de senha:', error);
      return { needsChange: false };
    }
  }
}

export const apiService = new ApiService();