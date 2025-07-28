import yt_dlp
import os
import sys

def verificar_dependencias():
    """Verifica se as dependências estão instaladas"""
    try:
        import yt_dlp
        print("✅ yt-dlp está instalado!")
        return True
    except ImportError:
        print("❌ yt-dlp não está instalado!")
        print("📥 Instale com: pip install yt-dlp")
        return False

def baixar_mp3_youtube():
    """Função para baixar áudio em MP3 do YouTube"""
    
    print("\n" + "="*50)
    print("🎵 BAIXADOR DE ÁUDIO MP3 DO YOUTUBE")
    print("="*50)
    
    # Solicita o link do vídeo
    try:
        url = input("\n📎 Cole o link do vídeo do YouTube: ").strip()
        
        if not url:
            print("❌ Por favor, insira um link válido!")
            return False
            
        # Valida se parece um link do YouTube
        if "youtube.com" not in url and "youtu.be" not in url:
            print("❌ Este não parece ser um link do YouTube!")
            return False
            
    except KeyboardInterrupt:
        print("\n👋 Operação cancelada pelo usuário.")
        return False
    
    # Pergunta sobre a qualidade do MP3
    print("\n🎯 Escolha a qualidade do MP3:")
    print("1 - Qualidade Padrão (128 kbps) - Arquivo menor")
    print("2 - Boa Qualidade (192 kbps) - Recomendado")
    print("3 - Alta Qualidade (320 kbps) - Arquivo maior")
    print("0 - Voltar")
    
    try:
        opcao = input("\n➤ Digite sua escolha (0-3): ").strip()
    except KeyboardInterrupt:
        print("\n👋 Operação cancelada.")
        return False
    
    if opcao == "0":
        return False
    
    # Define a qualidade baseada na escolha
    qualidades = {
        "1": "128",
        "2": "192", 
        "3": "320"
    }
    
    if opcao not in qualidades:
        print("❌ Opção inválida! Escolha entre 0-3.")
        return False
        
    qualidade_mp3 = qualidades[opcao]
    print(f"🎵 Configurado para MP3 {qualidade_mp3} kbps")
    
    # Pasta onde os arquivos serão salvos
    pasta_download = "MP3_Downloads"
    try:
        if not os.path.exists(pasta_download):
            os.makedirs(pasta_download)
            print(f"📁 Pasta criada: {pasta_download}")
    except Exception as e:
        print(f"❌ Erro ao criar pasta: {e}")
        return False
    
    # Configurações específicas para MP3
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'{pasta_download}/%(title)s.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': qualidade_mp3,
        }],
        'noplaylist': True,
        'extractaudio': True,
        'audioformat': 'mp3',
        'embed_subs': False,
        'writesubtitles': False,
    }
    
    # Realiza o download
    try:
        print("\n🔍 Obtendo informações do vídeo...")
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Obtém informações do vídeo primeiro
            info = ydl.extract_info(url, download=False)
            
            titulo = info.get('title', 'Título não disponível')
            duracao = info.get('duration', 0)
            uploader = info.get('uploader', 'Canal não disponível')
            
            print(f"\n📹 Título: {titulo}")
            print(f"👤 Canal: {uploader}")
            if duracao:
                mins = duracao // 60
                secs = duracao % 60
                print(f"⏱️  Duração: {mins}:{secs:02d}")
            print(f"🎵 Formato: MP3 {qualidade_mp3} kbps")
            
            # Confirma o download
            try:
                confirmar = input("\n✅ Baixar este áudio em MP3? (s/n): ").strip().lower()
                if confirmar in ['s', 'sim', 'yes', 'y']:
                    print("\n🚀 Iniciando download do MP3...")
                    print("⏳ Baixando e convertendo... (pode demorar alguns minutos)")
                    
                    # Progress hook para mostrar progresso
                    def progress_hook(d):
                        if d['status'] == 'downloading':
                            if 'total_bytes' in d:
                                percent = d['downloaded_bytes'] / d['total_bytes'] * 100
                                print(f"\r📥 Baixando: {percent:.1f}%", end='', flush=True)
                        elif d['status'] == 'finished':
                            print(f"\n🔄 Convertendo para MP3...")
                    
                    ydl_opts['progress_hooks'] = [progress_hook]
                    
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl_download:
                        ydl_download.download([url])
                    
                    print(f"\n🎉 MP3 baixado com sucesso!")
                    print(f"📁 Arquivo salvo em: {os.path.abspath(pasta_download)}")
                    print(f"🎵 Qualidade: {qualidade_mp3} kbps")
                    
                    # Mostra o arquivo criado
                    try:
                        arquivos = os.listdir(pasta_download)
                        arquivos_mp3 = [f for f in arquivos if f.endswith('.mp3')]
                        if arquivos_mp3:
                            ultimo_arquivo = max(arquivos_mp3, key=lambda x: os.path.getctime(os.path.join(pasta_download, x)))
                            print(f"📄 Nome do arquivo: {ultimo_arquivo}")
                    except:
                        pass
                        
                    return True
                else:
                    print("❌ Download cancelado pelo usuário.")
                    return False
                    
            except KeyboardInterrupt:
                print("\n❌ Download interrompido pelo usuário.")
                return False
                
    except yt_dlp.utils.DownloadError as e:
        print(f"\n❌ Erro no download: {str(e)}")
        print("💡 Possíveis causas:")
        print("   - Vídeo privado, removido ou com restrições")
        print("   - Problemas de conectividade")
        print("   - Vídeo muito longo ou protegido")
        return False
        
    except Exception as e:
        print(f"\n❌ Erro inesperado: {str(e)}")
        print("💡 Dica: Verifique se o FFmpeg está instalado para conversão MP3")
        return False

def main():
    """Função principal do programa"""
    
    print("🔧 Verificando dependências...")
    if not verificar_dependencias():
        print("\n❌ Instale as dependências antes de continuar:")
        print("📥 pip install yt-dlp")
        print("📥 E instale o FFmpeg para conversão MP3")
        input("Pressione Enter para sair...")
        return
    
    print("\n🎵 === BAIXADOR DE MP3 DO YOUTUBE === 🎵")
    print("💡 Converte automaticamente para MP3")
    print("⚠️  Use apenas para conteúdo que você tem direito de baixar")
    
    contador_downloads = 0
    
    while True:
        try:
            resultado = baixar_mp3_youtube()
            
            if resultado:
                contador_downloads += 1
                print(f"\n📊 Total de MP3s baixados nesta sessão: {contador_downloads}")
            
            # Pergunta se quer baixar outro
            try:
                continuar = input("\n🔄 Baixar outro MP3? (s/n): ").strip().lower()
                if continuar not in ['s', 'sim', 'yes', 'y']:
                    break
            except KeyboardInterrupt:
                break
                    
        except KeyboardInterrupt:
            print("\n👋 Programa interrompido pelo usuário.")
            break
        except Exception as e:
            print(f"\n❌ Erro inesperado: {str(e)}")
            break
    
    if contador_downloads > 0:
        print(f"\n🎉 Sessão finalizada! {contador_downloads} MP3(s) baixado(s)")
    print("👋 Obrigado por usar o programa! Até mais!")
    input("Pressione Enter para sair...")

if __name__ == "__main__":
    main()