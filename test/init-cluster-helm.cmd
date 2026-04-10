k3d cluster stop kwirth-helm
k3d cluster delete kwirth-helm
k3d cluster create kwirth-helm -p "80:80@loadbalancer" -p "443:443@loadbalancer" -p "8080:8080@loadbalancer" --k3s-arg "--disable=traefik@server:*" -a 1 

kubectl config use-context k3d-kwirth-helm

timeout 5 > NUL
rem deploy an ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.2/deploy/static/provider/cloud/deploy.yaml
